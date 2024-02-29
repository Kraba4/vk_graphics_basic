#include "simple_compute.h"

#include <vk_pipeline.h>
#include <vk_buffers.h>
#include <vk_utils.h>

#include <etna/Etna.hpp>
#include <vulkan/vulkan_core.h>

#include <random>
#include <cmath>

void SimpleCompute::loadShaders()
{
  etna::create_program("simple_compute", {VK_GRAPHICS_BASIC_ROOT"/resources/shaders/simple.comp.spv"});
}

void SimpleCompute::SetupSimplePipeline(const std::vector<float>& values)
{
  //// Buffer creation
  //
  m_A = m_context->createBuffer(etna::Buffer::CreateInfo
    {
      .size = sizeof(float) * m_length,
      .bufferUsage = vk::BufferUsageFlagBits::eStorageBuffer | vk::BufferUsageFlagBits::eTransferDst,
      .name = "m_A"
    }
  );

  m_Result = m_context->createBuffer(etna::Buffer::CreateInfo
    {
      .size = sizeof(float) * m_length,
      .bufferUsage = vk::BufferUsageFlagBits::eStorageBuffer | vk::BufferUsageFlagBits::eTransferSrc,
      .name = "m_Result"
    }
  );
  
  //// Filling the buffers
  m_pCopyHelper->UpdateBuffer(m_A.get(), 0, values.data(), sizeof(float) * values.size());

  //// Compute pipeline creation
  auto &pipelineManager = etna::get_context().getPipelineManager();
  m_pipeline = pipelineManager.createComputePipeline("simple_compute", {});
}

void SimpleCompute::CleanupPipeline()
{ 
  if (m_cmdBufferCompute)
  {
    vkFreeCommandBuffers(m_context->getDevice(), m_commandPool, 1, &m_cmdBufferCompute);
  }

  m_A.reset();
  m_Result.reset();
  vkDestroyFence(m_context->getDevice(), m_fence, nullptr);
}

void SimpleCompute::BuildCommandBufferSimple(VkCommandBuffer a_cmdBuff, VkPipeline)
{
  vkResetCommandBuffer(a_cmdBuff, 0);

  VkCommandBufferBeginInfo beginInfo = {};
  beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
  beginInfo.flags = VK_COMMAND_BUFFER_USAGE_SIMULTANEOUS_USE_BIT;

  // Filling the command buffer
  VK_CHECK_RESULT(vkBeginCommandBuffer(a_cmdBuff, &beginInfo));

  auto simpleComputeInfo = etna::get_shader_program("simple_compute");

  auto set = etna::create_descriptor_set(simpleComputeInfo.getDescriptorLayoutId(0), a_cmdBuff,
    {
      etna::Binding {0, m_A.genBinding()},
      etna::Binding {1, m_Result.genBinding()},
    }
  );

  VkDescriptorSet vkSet = set.getVkSet();

  vkCmdBindPipeline      (a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_pipeline.getVkPipeline());
  vkCmdBindDescriptorSets(a_cmdBuff, VK_PIPELINE_BIND_POINT_COMPUTE, m_pipeline.getVkPipelineLayout(), 0, 1, &vkSet, 0, NULL);

  vkCmdPushConstants(a_cmdBuff, m_pipeline.getVkPipelineLayout(), VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(m_length), &m_length);

  etna::flush_barriers(a_cmdBuff);

  vkCmdDispatch(a_cmdBuff, (m_length / 1000) + 1, 1, 1);

  VK_CHECK_RESULT(vkEndCommandBuffer(a_cmdBuff));
}

std::vector<float> SimpleCompute::GetRandomValues(const uint32_t size, std::optional<uint32_t> seed) const {
  std::mt19937 gen(seed.has_value() ? seed.value() : std::random_device()());
  std::uniform_real_distribution<float> dis(0, 1);

  std::vector<float> values;
  values.reserve(size);
  for (uint32_t index = 0; index < size; ++index) {
    values.push_back(dis(gen));
  }
  return values;
}

std::vector<float> SimpleCompute::SmoothValues(const std::vector<float>& values,
                                               const uint32_t smooth_window_size) const {
  assert(smooth_window_size % 2 == 1);

  const uint32_t half_window = smooth_window_size / 2;                                              
  std::vector<float> smoothed_values(values.size());

  for (uint32_t index = 0; index < values.size(); ++index) {
    float sum = SafeSumRange(values, static_cast<int>(index) - static_cast<int>(half_window), index + half_window);
    smoothed_values[index] = sum / static_cast<float>(smooth_window_size);
  }
  return smoothed_values;
}

float SimpleCompute::SafeSumRange(const std::vector<float>& values, const int signed_index_begin, const int signed_index_end) const {
  float sum = 0.f;
  for (int index = signed_index_begin; index <= signed_index_end; ++index) {
    if (index >= 0 && index < static_cast<int>(values.size())) {
      sum += values[index];
    }
  }
  return sum;
}

double SimpleCompute::SumOfSubtractions(const std::vector<float>& to_reduce, const std::vector<float>& to_substact) const {
  assert(to_reduce.size() == to_substact.size());
  double sum = 0;
  for (uint32_t index = 0; index < to_reduce.size(); ++index) {
    sum += to_reduce[index] - to_substact[index];
    constexpr float rounder = 1 << 16;
    sum = int(sum * rounder) / rounder; 
  }
  return sum;
}
