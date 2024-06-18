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

  normals = m_context->createImage(etna::Image::CreateInfo
  {
    .extent = vk::Extent3D{m_width, m_height, 1},
    .name = "normals",
    .format = vk::Format::eR16G16B16A16Sfloat,
    .imageUsage = vk::ImageUsageFlagBits::eSampled | vk::ImageUsageFlagBits::eColorAttachment
  });

  positions = m_context->createImage(etna::Image::CreateInfo
  {
    .extent = vk::Extent3D{m_width, m_height, 1},
    .name = "positions",
    .format = vk::Format::eR16G16B16A16Sfloat,
    .imageUsage = vk::ImageUsageFlagBits::eSampled | vk::ImageUsageFlagBits::eColorAttachment
  });

  defaultSampler = etna::Sampler(etna::Sampler::CreateInfo{.name = "default_sampler"});
  constants = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(UniformParams),
    .bufferUsage = vk::BufferUsageFlagBits::eUniformBuffer,
    .memoryUsage = VMA_MEMORY_USAGE_CPU_ONLY,
    .name = "constants"
  });
  
  spawnConstants = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(SpawnParams),
    .bufferUsage = vk::BufferUsageFlagBits::eUniformBuffer,
    .memoryUsage = VMA_MEMORY_USAGE_CPU_ONLY,
    .name = "spawn_constants"
  });

  particles = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(Particle) * nParticles,
    .bufferUsage = vk::BufferUsageFlagBits::eStorageBuffer,
    .memoryUsage = VMA_MEMORY_USAGE_GPU_ONLY,
    .name = "particles"
  });
  particlesParams = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(float4),
    .bufferUsage = vk::BufferUsageFlagBits::eStorageBuffer,
    .memoryUsage = VMA_MEMORY_USAGE_CPU_ONLY,
    .name = "particles_params"
  });
  colorParams = m_context->createBuffer(etna::Buffer::CreateInfo
  {
    .size = sizeof(ColorParams),
    .bufferUsage = vk::BufferUsageFlagBits::eUniformBuffer,
    .memoryUsage = VMA_MEMORY_USAGE_CPU_ONLY,
    .name = "color_params"
  });
  pushConstComputeSpawn.maxParticles = nParticles;
  pushConstComputeSpawn.startPos = 0;

  m_uboMappedMem = constants.map();
  m_uboMappedMemSpawn = spawnConstants.map();
  m_uboMappedMemColor = colorParams.map();
  m_uboMappedParticlesParams = reinterpret_cast<float4*>(particlesParams.map());
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
  etna::create_program("physics_particles", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/physicsAndSpawn.comp.spv"});
  etna::create_program("sort_particles", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/sort.comp.spv"});
  etna::create_program("init_particles", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/init.comp.spv"});
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
      .blendingConfig = {
        .attachments = {
          vk::PipelineColorBlendAttachmentState{
            .blendEnable = vk::False,
            // Which color channels should we write to?
            .colorWriteMask = vk::ColorComponentFlagBits::eR | vk::ColorComponentFlagBits::eG |
              vk::ColorComponentFlagBits::eB | vk::ColorComponentFlagBits::eA,
          },
           vk::PipelineColorBlendAttachmentState{
            .blendEnable = vk::False,
            // Which color channels should we write to?
            .colorWriteMask = vk::ColorComponentFlagBits::eR | vk::ColorComponentFlagBits::eG |
              vk::ColorComponentFlagBits::eB | vk::ColorComponentFlagBits::eA,
          },
           vk::PipelineColorBlendAttachmentState{
            .blendEnable = vk::False,
            // Which color channels should we write to?
            .colorWriteMask = vk::ColorComponentFlagBits::eR | vk::ColorComponentFlagBits::eG |
              vk::ColorComponentFlagBits::eB | vk::ColorComponentFlagBits::eA,
          },
        },
        .logicOp = vk::LogicOp::eNoOp
      },
      .fragmentShaderOutput =
        {
          .colorAttachmentFormats = {static_cast<vk::Format>(m_swapchain.GetFormat()),
                                    vk::Format::eR16G16B16A16Sfloat,
                                    vk::Format::eR16G16B16A16Sfloat},
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
  m_physicsPipeline = pipelineManager.createComputePipeline("physics_particles", {});
  m_sortPipeline = pipelineManager.createComputePipeline("sort_particles", {});
  m_initPipeline = pipelineManager.createComputePipeline("init_particles", {});

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
  for (uint32_t i = 0; i < m_uboMappedParticlesParams->x + 1; ++i)
  {
    pushConstParticles.rightAndIndex.w = i;
    vkCmdPushConstants(a_cmdBuff, a_pipelineLayout,
      stageFlags, 0, sizeof(pushConstParticles), &pushConstParticles);
    vkCmdDraw(a_cmdBuff, 3, 1, 0, 0);
  }
}

void SimpleShadowmapRender::BuildCommandBufferSimple(VkCommandBuffer a_cmdBuff, VkImage a_targetImage, VkImageView a_targetImageView)
{
  vkResetCommandBuffer(a_cmdBuff, 0);

  VkCommandBufferBeginInfo beginInfo = {};
  beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
  beginInfo.flags = VK_COMMAND_BUFFER_USAGE_SIMULTANEOUS_USE_BIT;

  VK_CHECK_RESULT(vkBeginCommandBuffer(a_cmdBuff, &beginInfo));

  //// init particles once
  //
  {
    static bool needInit = true;
    if (needInit) {
      auto simpleComputeInfo = etna::get_shader_program("init_particles");
      auto set = etna::create_descriptor_set(simpleComputeInfo.getDescriptorLayoutId(0), a_cmdBuff,
        {
          etna::Binding {0, particles.genBinding()},
          etna::Binding {1, particlesParams.genBinding()}
        }
      );
      VkDescriptorSet vkSet = set.getVkSet();

      vkCmdBindPipeline      (a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_initPipeline.getVkPipeline());
      vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_initPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, NULL);
      vkCmdDispatch(a_cmdBuff, 1, 1, 1);

      m_dt = 0.1;
      needInit = false;
    }
  }

  VkBufferMemoryBarrier2 memoryBarrier[2] = {{
    .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER_2,
    .srcStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT,
    .srcAccessMask = VK_ACCESS_2_SHADER_WRITE_BIT | VK_ACCESS_2_SHADER_READ_BIT,
    .dstStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT,
    .dstAccessMask = VK_ACCESS_2_SHADER_READ_BIT | VK_ACCESS_2_SHADER_WRITE_BIT,
    .srcQueueFamilyIndex = m_context->getQueueFamilyIdx(),
    .dstQueueFamilyIndex = m_context->getQueueFamilyIdx(),
    .buffer = particles.get(),
    .offset = 0,
    .size = nParticles * sizeof(Particle)},
    {
    .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER_2,
    .srcStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT,
    .srcAccessMask = VK_ACCESS_2_SHADER_WRITE_BIT | VK_ACCESS_2_SHADER_READ_BIT,
    .dstStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT,
    .dstAccessMask = VK_ACCESS_2_SHADER_READ_BIT | VK_ACCESS_2_SHADER_WRITE_BIT,
    .srcQueueFamilyIndex = m_context->getQueueFamilyIdx(),
    .dstQueueFamilyIndex = m_context->getQueueFamilyIdx(),
    .buffer = particlesParams.get(),
    .offset = 0,
    .size = sizeof(float4)}};

  VkDependencyInfo dependencyInfo = {
    .sType = VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
    .bufferMemoryBarrierCount = 2,              
    .pBufferMemoryBarriers = memoryBarrier, 
  };

  //// compute physics and spawn
  //
  {
    auto simpleComputeInfo = etna::get_shader_program("physics_particles");
    auto set = etna::create_descriptor_set(simpleComputeInfo.getDescriptorLayoutId(0), a_cmdBuff,
      {
        etna::Binding {0, particles.genBinding()},
        etna::Binding {1, particlesParams.genBinding()},
        etna::Binding {2, spawnConstants.genBinding()},
      }
    );
    VkDescriptorSet vkSet = set.getVkSet();
    pushConstComputePhysics.projView = m_worldViewProj;
    pushConstComputePhysics.dt_step.x = m_dt;
    pushConstComputePhysics.dt_step.y = m_step;
    m_step = (m_step + 1) % 88;
    int needThreads = m_uboMappedParticlesParams->y + 1;
    int needComputeGroups = needThreads / 64 + ((needThreads % 64) > 0);
    vkCmdBindPipeline      (a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_physicsPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_physicsPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, NULL);
    vkCmdPushConstants(a_cmdBuff, m_physicsPipeline.getVkPipelineLayout(), VK_SHADER_STAGE_COMPUTE_BIT, 0, 
                       sizeof(pushConstComputePhysics), &pushConstComputePhysics);
    vkCmdPipelineBarrier2(a_cmdBuff, &dependencyInfo); 
    vkCmdDispatch(a_cmdBuff, needComputeGroups, 1, 1);
  }

  //// compute sort
  //
  {
    auto simpleComputeInfo = etna::get_shader_program("sort_particles");
    auto set = etna::create_descriptor_set(simpleComputeInfo.getDescriptorLayoutId(0), a_cmdBuff,
      {
        etna::Binding {0, particles.genBinding()},
        etna::Binding {1, particlesParams.genBinding()}
      }
    );
    VkDescriptorSet vkSet = set.getVkSet();

    vkCmdBindPipeline      (a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_sortPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_sortPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, NULL);
    vkCmdPipelineBarrier2(a_cmdBuff, &dependencyInfo);
    vkCmdDispatch(a_cmdBuff, 1, 1, 1);
  }

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
      {{.image = a_targetImage, .view = a_targetImageView},
       {normals.get(), normals.getView({})}, {positions.get(), positions.getView({})}},
      {.image = mainViewDepth.get(), .view = mainViewDepth.getView({})});

    vkCmdBindPipeline(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS, m_basicForwardPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS,
      m_basicForwardPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, VK_NULL_HANDLE);
    DrawSceneCmd(a_cmdBuff, m_worldViewProj, m_basicForwardPipeline.getVkPipelineLayout());
  }

  //// draw particles
  //
  {
     VkBufferMemoryBarrier2 memoryBarrier2 = {
      .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER_2,
      .srcStageMask = VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT,
      .srcAccessMask = VK_ACCESS_2_SHADER_WRITE_BIT | VK_ACCESS_2_SHADER_READ_BIT,
      .dstStageMask = VK_PIPELINE_STAGE_2_VERTEX_SHADER_BIT,
      .dstAccessMask = VK_ACCESS_2_SHADER_READ_BIT,
      .srcQueueFamilyIndex = m_context->getQueueFamilyIdx(),
      .dstQueueFamilyIndex = m_context->getQueueFamilyIdx(),
      .buffer = particles.get(),
      .offset = 0,
      .size = nParticles * sizeof(Particle)};

    VkDependencyInfo dependencyInfo2 = {
      .sType = VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
      .bufferMemoryBarrierCount = 1,              // memoryBarrierCount
      .pBufferMemoryBarriers = &memoryBarrier2, // pMemoryBarriers
    };
    
    auto simpleMaterialInfo = etna::get_shader_program("particles_material");
    auto set = etna::create_descriptor_set(simpleMaterialInfo.getDescriptorLayoutId(0), a_cmdBuff,
    {
      etna::Binding {0, particles.genBinding()},
      etna::Binding {1, normals.genBinding(defaultSampler.get(), vk::ImageLayout::eShaderReadOnlyOptimal)},
      etna::Binding {2, positions.genBinding(defaultSampler.get(), vk::ImageLayout::eShaderReadOnlyOptimal)},
      etna::Binding {3, colorParams.genBinding()},
    });
    VkDescriptorSet vkSet = set.getVkSet();

    etna::RenderTargetState renderTargets(a_cmdBuff, {0, 0, m_width, m_height},
      {{.image = a_targetImage, .view = a_targetImageView, .loadOp = vk::AttachmentLoadOp::eLoad}},
      {.image = mainViewDepth.get(), .view = mainViewDepth.getView({}), .loadOp = vk::AttachmentLoadOp::eLoad});

    vkCmdBindPipeline(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS, m_particlesPipeline.getVkPipeline());
    vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_GRAPHICS,
      m_particlesPipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, VK_NULL_HANDLE);
    vkCmdPipelineBarrier2(a_cmdBuff, &dependencyInfo2);
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
