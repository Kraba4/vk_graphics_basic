#include "shadowmap_render.h"

#include <geom/vk_mesh.h>
#include <vk_pipeline.h>
#include <vk_buffers.h>
#include <iostream>

#include <etna/GlobalContext.hpp>
#include <etna/Etna.hpp>
#include <etna/RenderTargetStates.hpp>
#include <vulkan/vulkan_core.h>
#include "../../../external/glfw/include/GLFW/glfw3.h"
#include <GLFW/glfw3.h>


/// RESOURCE ALLOCATION

void SimpleShadowmapRender::AllocateResources()
{
  mainViewDepth = m_context->createImage(etna::Image::CreateInfo
  {
    .extent = vk::Extent3D{m_width, m_height, 1},
    .name = "main_view_depth",
    .format = vk::Format::eD32Sfloat,
    .imageUsage = vk::ImageUsageFlagBits::eDepthStencilAttachment
  });

  shadowMap = m_context->createImage(etna::Image::CreateInfo
  {
    .extent = vk::Extent3D{2048, 2048, 1},
    .name = "shadow_map",
    .format = vk::Format::eD16Unorm,
    .imageUsage = vk::ImageUsageFlagBits::eDepthStencilAttachment | vk::ImageUsageFlagBits::eSampled
  });

  defaultSampler = etna::Sampler(etna::Sampler::CreateInfo{.name = "default_sampler"});
  constants = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(UniformParams),
    .bufferUsage = vk::BufferUsageFlagBits::eUniformBuffer,
    .memoryUsage = VMA_MEMORY_USAGE_CPU_ONLY,
    .name = "constants"
  });
  
  particles = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(Particle) * nParticles,
    .bufferUsage = vk::BufferUsageFlagBits::eUniformBuffer | vk::BufferUsageFlagBits::eStorageBuffer | vk::BufferUsageFlagBits::eTransferDst,
    .memoryUsage = VMA_MEMORY_USAGE_CPU_ONLY,
    .name = "particles"
  });
  pushConstComputeSpawn.maxParticles = nParticles;
  pushConstComputeSpawn.startPos = 0;

  m_uboMappedMem = constants.map();
  m_uboMappedParticles = reinterpret_cast<Particle*>(particles.map());
}

void SimpleShadowmapRender::LoadScene(const char* path, bool transpose_inst_matrices)
{
  m_pScnMgr->LoadSceneXML(path, transpose_inst_matrices);

  // TODO: Make a separate stage
  loadShaders();
  PreparePipelines();

  auto loadedCam = m_pScnMgr->GetCamera(0);
  m_cam.fov = loadedCam.fov;
  m_cam.pos = float3(loadedCam.pos);
  m_cam.up  = float3(loadedCam.up);
  m_cam.lookAt = float3(loadedCam.lookAt);
  m_cam.tdist  = loadedCam.farPlane;
}

void SimpleShadowmapRender::DeallocateResources()
{
  mainViewDepth.reset(); // TODO: Make an etna method to reset all the resources
  shadowMap.reset();
  m_swapchain.Cleanup();
  vkDestroySurfaceKHR(GetVkInstance(), m_surface, nullptr);  

  constants = etna::Buffer();
}





/// PIPELINES CREATION

void SimpleShadowmapRender::PreparePipelines()
{
  // create full screen quad for debug purposes
  // 
  m_pQuad = std::make_unique<QuadRenderer>(QuadRenderer::CreateInfo{ 
      .format = static_cast<vk::Format>(m_swapchain.GetFormat()),
      .rect = { 0, 0, 512, 512 }, 
    });
  SetupSimplePipeline();
}

void SimpleShadowmapRender::loadShaders()
{
  etna::create_program("simple_material",
    {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/simple_shadow.frag.spv", VK_GRAPHICS_BASIC_ROOT"/resources/shaders/simple.vert.spv"});
  etna::create_program("simple_shadow", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/simple.vert.spv"});
  etna::create_program("spawn_particles", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/spawn.comp.spv"});
  etna::create_program("physics_particles", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/physics.comp.spv"});
  etna::create_program("particles_material", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/particles.vert.spv", 
                                            VK_GRAPHICS_BASIC_ROOT"/resources/shaders/particles.frag.spv"});
}

void SimpleShadowmapRender::SetupSimplePipeline()
{
  etna::VertexShaderInputDescription sceneVertexInputDesc
    {
      .bindings = {etna::VertexShaderInputDescription::Binding
        {
          .byteStreamDescription = m_pScnMgr->GetVertexStreamDescription()
        }}
    };

  auto& pipelineManager = etna::get_context().getPipelineManager();
  m_basicForwardPipeline = pipelineManager.createGraphicsPipeline("simple_material",
    {
      .vertexShaderInput = sceneVertexInputDesc,
      .fragmentShaderOutput =
        {
          .colorAttachmentFormats = {static_cast<vk::Format>(m_swapchain.GetFormat())},
          .depthAttachmentFormat = vk::Format::eD32Sfloat
        }
    });
  m_shadowPipeline = pipelineManager.createGraphicsPipeline("simple_shadow",
    {
      .vertexShaderInput = sceneVertexInputDesc,
      .fragmentShaderOutput =
        {
          .depthAttachmentFormat = vk::Format::eD16Unorm
        }
    });
  m_spawnParticles = pipelineManager.createComputePipeline("spawn_particles", {});
  m_physicsPipeline = pipelineManager.createComputePipeline("physics_particles", {});

  m_particlesPipeline = pipelineManager.createGraphicsPipeline("particles_material",
    {
      .blendingConfig = {
        // Should contain an element for every color attachment that
        // your pixel shader will output to, i.e. for every output variable.
        .attachments = {
          vk::PipelineColorBlendAttachmentState{
            .blendEnable = vk::True,
            // Which color channels should we write to?
            .srcColorBlendFactor = vk::BlendFactor::eSrcAlpha,
            .dstColorBlendFactor = vk::BlendFactor::eOneMinusSrcAlpha,
            .colorBlendOp        = vk::BlendOp::eAdd,
            .srcAlphaBlendFactor = vk::BlendFactor::eOne,
            .dstAlphaBlendFactor = vk::BlendFactor::eZero,
            .alphaBlendOp        = vk::BlendOp::eAdd,
            .colorWriteMask = vk::ColorComponentFlagBits::eR | vk::ColorComponentFlagBits::eG |
              vk::ColorComponentFlagBits::eB | vk::ColorComponentFlagBits::eA,
          },
        },
        .logicOpEnable = false
      },
      .fragmentShaderOutput =
        {
          .colorAttachmentFormats = {static_cast<vk::Format>(m_swapchain.GetFormat())},
          .depthAttachmentFormat = vk::Format::eD32Sfloat
        }
    });
}


/// COMMAND BUFFER FILLING

void SimpleShadowmapRender::DrawSceneCmd(VkCommandBuffer a_cmdBuff, const float4x4& a_wvp, VkPipelineLayout a_pipelineLayout)
{
  VkShaderStageFlags stageFlags = (VK_SHADER_STAGE_VERTEX_BIT);

  VkDeviceSize zero_offset = 0u;
  VkBuffer vertexBuf = m_pScnMgr->GetVertexBuffer();
  VkBuffer indexBuf  = m_pScnMgr->GetIndexBuffer();
  
  vkCmdBindVertexBuffers(a_cmdBuff, 0, 1, &vertexBuf, &zero_offset);
  vkCmdBindIndexBuffer(a_cmdBuff, indexBuf, 0, VK_INDEX_TYPE_UINT32);

  pushConst2M.projView = a_wvp;
  for (uint32_t i = 0; i < m_pScnMgr->InstancesNum(); ++i)
  {
    auto inst         = m_pScnMgr->GetInstanceInfo(i);
    pushConst2M.model = m_pScnMgr->GetInstanceMatrix(i);
    vkCmdPushConstants(a_cmdBuff, a_pipelineLayout,
      stageFlags, 0, sizeof(pushConst2M), &pushConst2M);

    auto mesh_info = m_pScnMgr->GetMeshInfo(inst.mesh_id);
    vkCmdDrawIndexed(a_cmdBuff, mesh_info.m_indNum, 1, mesh_info.m_indexOffset, mesh_info.m_vertexOffset, 0);
  }
}

void SimpleShadowmapRender::DrawParticlesCmd(VkCommandBuffer a_cmdBuff, const float4x4& a_wvp, VkPipelineLayout a_pipelineLayout)
{
  VkShaderStageFlags stageFlags = (VK_SHADER_STAGE_VERTEX_BIT);
  pushConstParticles.projView = a_wvp;
  for (uint32_t i = 0; i < pushConstComputeSpawn.startPos; ++i)
  {
    pushConstParticles.rightAndIndex.w = i;
    vkCmdPushConstants(a_cmdBuff, a_pipelineLayout,
      stageFlags, 0, sizeof(pushConstParticles), &pushConstParticles);
    vkCmdDraw(a_cmdBuff, 6, 1, 0, 0);
  }
}

void SimpleShadowmapRender::BuildCommandBufferSimple(VkCommandBuffer a_cmdBuff, VkImage a_targetImage, VkImageView a_targetImageView)
{
  vkResetCommandBuffer(a_cmdBuff, 0);

  VkCommandBufferBeginInfo beginInfo = {};
  beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
  beginInfo.flags = VK_COMMAND_BUFFER_USAGE_SIMULTANEOUS_USE_BIT;

  VK_CHECK_RESULT(vkBeginCommandBuffer(a_cmdBuff, &beginInfo));
  double curTime = m_uniforms.time;
  static double lastTime = curTime;

  int ni = -1;
  // compute spawn particles
  if (curTime - lastTime > 0.2)
  {
     VkBufferMemoryBarrier2 memoryBarrier = {
      .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER_2,
      .srcStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT_KHR,
      .srcAccessMask = VK_ACCESS_2_SHADER_WRITE_BIT_KHR,
      .dstStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT_KHR,
      .dstAccessMask = VK_ACCESS_2_SHADER_READ_BIT_KHR,
      .srcQueueFamilyIndex = m_context->getQueueFamilyIdx(),
      .dstQueueFamilyIndex = m_context->getQueueFamilyIdx(),
      .buffer = particles.get(),
      .offset = 0,
      .size = nParticles * sizeof(Particle)};

    VkDependencyInfo dependencyInfo = {
      .sType = VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
      .bufferMemoryBarrierCount = 1,              // memoryBarrierCount
      .pBufferMemoryBarriers = &memoryBarrier, // pMemoryBarriers
    };

    vkCmdPipelineBarrier2(a_cmdBuff, &dependencyInfo); 

    lastTime = curTime;
    auto simpleComputeInfo = etna::get_shader_program("spawn_particles");

    auto set = etna::create_descriptor_set(simpleComputeInfo.getDescriptorLayoutId(0), a_cmdBuff,
      {
        etna::Binding {0, particles.genBinding()}
      }
    );

    VkDescriptorSet vkSet = set.getVkSet();

    vkCmdBindPipeline      (a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_spawnParticles.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_spawnParticles.getVkPipelineLayout(), 0, 1, &vkSet, 0, NULL);

    uint16_t nNeedSpawn = 1;
    pushConstComputeSpawn.maxParticles = nParticles;
    assert(pushConstComputeSpawn.startPos + nNeedSpawn < nParticles);
    vkCmdPushConstants(a_cmdBuff, m_spawnParticles.getVkPipelineLayout(), VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(pushConstComputeSpawn), &pushConstComputeSpawn);

    etna::flush_barriers(a_cmdBuff);

    vkCmdDispatch(a_cmdBuff, nNeedSpawn, 1, 1);
    pushConstComputeSpawn.startPos = (pushConstComputeSpawn.startPos + nNeedSpawn);
    // std::cout << "spawn\n";
    // int i = pushConstComputeSpawn.startPos - 1;
    // std::cout << m_uboMappedParticles[i].positionAndTimeToLive.x << ',' <<
    //              m_uboMappedParticles[i].positionAndTimeToLive.y << ',' <<
    //              m_uboMappedParticles[i].positionAndTimeToLive.z << ',' << 
    //              m_uboMappedParticles[i].positionAndTimeToLive.w << '\n';

    vkCmdPipelineBarrier2(a_cmdBuff, &dependencyInfo); 
  }
  // compute physics
  {
    auto simpleComputeInfo = etna::get_shader_program("physics_particles");

    auto set = etna::create_descriptor_set(simpleComputeInfo.getDescriptorLayoutId(0), a_cmdBuff,
      {
        etna::Binding {0, particles.genBinding()}
      }
    );

    VkDescriptorSet vkSet = set.getVkSet();

    vkCmdBindPipeline      (a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_physicsPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_physicsPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, NULL);

    pushConstComputePhysics.dt = m_dt;
    vkCmdPushConstants(a_cmdBuff, m_physicsPipeline.getVkPipelineLayout(), VK_SHADER_STAGE_COMPUTE_BIT, 0, 
                       sizeof(pushConstComputePhysics), &pushConstComputePhysics);

    etna::flush_barriers(a_cmdBuff);

    vkCmdDispatch(a_cmdBuff, 1, 1, 1);
    if (ni != -1) {
       std::cout << m_uboMappedParticles[ni].positionAndTimeToLive.x << ',' <<
                 m_uboMappedParticles[ni].positionAndTimeToLive.y << ',' <<
                 m_uboMappedParticles[ni].positionAndTimeToLive.z << ',' << 
                 m_uboMappedParticles[ni].positionAndTimeToLive.w << '\n';
    }
  }

  // std::sort(m_uboMappedParticles, m_uboMappedParticles + pushConstComputeSpawn.startPos, 
  //   [](const Particle &p1, const Particle &p2) {
  //     return p1.velocity.w < p2.velocity.w;
  //   });

  // uint16_t nAliveParticles = std::lower_bound(m_uboMappedParticles,
  //            m_uboMappedParticles + pushConstComputeSpawn.startPos, 1000000, 
  //             [](const Particle &p1, const Particle &p2) {
  //             return p1.velocity.w < p2.velocity.w; // depth
  //           }) - m_uboMappedParticles;
  // pushConstComputeSpawn.startPos = nAliveParticles;
  //// draw scene to shadowmap
  //
  {
    etna::RenderTargetState renderTargets(a_cmdBuff, {0, 0, 2048, 2048}, {}, {.image = shadowMap.get(), .view = shadowMap.getView({})});

    vkCmdBindPipeline(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS, m_shadowPipeline.getVkPipeline());
    DrawSceneCmd(a_cmdBuff, m_lightMatrix, m_shadowPipeline.getVkPipelineLayout());
  }

  //// draw final scene to screen
  //
  {
    auto simpleMaterialInfo = etna::get_shader_program("simple_material");

    auto set = etna::create_descriptor_set(simpleMaterialInfo.getDescriptorLayoutId(0), a_cmdBuff,
    {
      etna::Binding {0, constants.genBinding()},
      etna::Binding {1, shadowMap.genBinding(defaultSampler.get(), vk::ImageLayout::eShaderReadOnlyOptimal)}
    });

    VkDescriptorSet vkSet = set.getVkSet();

    etna::RenderTargetState renderTargets(a_cmdBuff, {0, 0, m_width, m_height},
      {{.image = a_targetImage, .view = a_targetImageView}},
      {.image = mainViewDepth.get(), .view = mainViewDepth.getView({})});

    vkCmdBindPipeline(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS, m_basicForwardPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS,
      m_basicForwardPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, VK_NULL_HANDLE);

    DrawSceneCmd(a_cmdBuff, m_worldViewProj, m_basicForwardPipeline.getVkPipelineLayout());
  }


  //// draw particles
  //
  {
    auto simpleMaterialInfo = etna::get_shader_program("particles_material");

    auto set = etna::create_descriptor_set(simpleMaterialInfo.getDescriptorLayoutId(0), a_cmdBuff,
    {
      etna::Binding {0, particles.genBinding()}
    });

    VkDescriptorSet vkSet = set.getVkSet();

    etna::RenderTargetState renderTargets(a_cmdBuff, {0, 0, m_width, m_height},
      {{.image = a_targetImage, .view = a_targetImageView, .loadOp = vk::AttachmentLoadOp::eLoad}},
      {.image = mainViewDepth.get(), .view = mainViewDepth.getView({}), .loadOp = vk::AttachmentLoadOp::eLoad});

    vkCmdBindPipeline(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS, m_particlesPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS,
      m_particlesPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, VK_NULL_HANDLE);

    DrawParticlesCmd(a_cmdBuff, m_worldViewProj, m_particlesPipeline.getVkPipelineLayout());
  }

  if(m_input.drawFSQuad)
    m_pQuad->RecordCommands(a_cmdBuff, a_targetImage, a_targetImageView, shadowMap, defaultSampler);

  etna::set_state(a_cmdBuff, a_targetImage, vk::PipelineStageFlagBits2::eBottomOfPipe,
    vk::AccessFlags2(), vk::ImageLayout::ePresentSrcKHR,
    vk::ImageAspectFlagBits::eColor);

  etna::finish_frame(a_cmdBuff);

  VK_CHECK_RESULT(vkEndCommandBuffer(a_cmdBuff));
}
