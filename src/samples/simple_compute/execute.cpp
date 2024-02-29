#include "simple_compute.h"

#include <etna/Etna.hpp>


void SimpleCompute::Execute()
{ 
  const auto values = GetRandomValues(m_length);
  loadShaders();
  SetupSimplePipeline(values);

  ///////////////////////////////////////////////////////////////////////////////
  auto start{std::chrono::high_resolution_clock::now()};
  BuildCommandBufferSimple(m_cmdBufferCompute, nullptr);

  VkSubmitInfo submitInfo = {};
  submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
  submitInfo.commandBufferCount = 1;
  submitInfo.pCommandBuffers = &m_cmdBufferCompute;
  VkFenceCreateInfo fenceCreateInfo = {};
  fenceCreateInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
  fenceCreateInfo.flags = 0;

  VK_CHECK_RESULT(vkCreateFence(m_context->getDevice(), &fenceCreateInfo, NULL, &m_fence));
  VK_CHECK_RESULT(vkQueueSubmit(m_context->getQueue(), 1, &submitInfo, m_fence));
  VK_CHECK_RESULT(vkWaitForFences(m_context->getDevice(), 1, &m_fence, VK_TRUE, UINT64_MAX));

  std::vector<float> smoothed_values_gpu(m_length);
  m_pCopyHelper->ReadBuffer(m_Result.get(), 0, smoothed_values_gpu.data(), sizeof(float) * smoothed_values_gpu.size());
  
  double sum = SumOfSubtractions(values, smoothed_values_gpu);

  auto end{std::chrono::high_resolution_clock::now()};
  std::chrono::duration<double> elapsed_seconds{end - start};

  std::cout << "\n gpu: \n";
  std::cout << elapsed_seconds << std::endl;
  std::cout << "sum = " << sum << std::endl;
  ///////////////////////////////////////////////////////////////////////////////



  ///////////////////////////////////////////////////////////////////////////////
  start = std::chrono::high_resolution_clock::now();

  auto smoothed_values_cpu = SmoothValues(values, 7);
  double sum2 = SumOfSubtractions(values, smoothed_values_cpu);

  end   = std::chrono::high_resolution_clock::now();
  std::chrono::duration<double> elapsed_seconds2{end - start};

  std::cout << "\n cpu: \n";
  std::cout << elapsed_seconds2 << std::endl;
  std::cout << "sum = " << sum2 << std::endl;
  ///////////////////////////////////////////////////////////////////////////////


  double mse = 0.0;
  for (int i = 0; i < smoothed_values_cpu.size(); ++i) {
    mse += (smoothed_values_cpu[i] - smoothed_values_gpu[i]) * (smoothed_values_cpu[i] - smoothed_values_gpu[i]);
  }
  mse /= static_cast<double>(smoothed_values_cpu.size());
  std::cout << "\n mse = " << mse << std::endl;
  // for (auto v : values) {
  //   std::cout << v << ' ';
  // }
  // std::cout << std::endl;

  // for (int i = 0; i < 10; ++i) {
  //   std::cout << smoothed_values_cpu[i] << ' ';
  // }
  // std::cout << std::endl;
  // for (int i = 0; i < 10; ++i) {
  //   std::cout << smoothed_values_gpu[i] << ' ';
  // }
  // std::cout << std::endl << std::endl;

  // for (int i = m_length - 10; i < m_length; ++i) {
  //   std::cout << smoothed_values_cpu[i] << ' ';
  // }
  // std::cout << std::endl;
  // for (int i = m_length - 10; i < m_length; ++i) {
  //   std::cout << smoothed_values_gpu[i] << ' ';
  // }
  // std::cout << std::endl;

  // for (auto v : smoothed_values_cpu) {
  //   std::cout << v << ' ';
  // }
  // std::cout << std::endl;
}
