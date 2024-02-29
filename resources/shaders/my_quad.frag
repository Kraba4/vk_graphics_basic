#version 450
#extension GL_ARB_separate_shader_objects : enable
 
layout(location = 0) out vec4 color;
 
layout (binding = 0) uniform sampler2D colorTex;
 
layout (location = 0 ) in VS_OUT
{
  vec2 texCoord;
} surf;
 
struct BlockOfTexels3x3 {
  float r_values[9];
  float g_values[9];
  float b_values[9];
  float a_values[9];
};
 
void fetchBlockOfTexels(const sampler2D tex, const vec2 tex_coord, const int lod, out BlockOfTexels3x3 block) {
  const ivec2 tex_size = textureSize(tex, 0);
  vec2 tex_non_normalized_coord = vec2(tex_coord * tex_size);
 
  tex_non_normalized_coord.x += 1.0 - step(1.0, tex_non_normalized_coord.x);
  tex_non_normalized_coord.x -= 1.0 - step(-tex_size.x + 1.0, -tex_non_normalized_coord.x);
 
  tex_non_normalized_coord.y += 1.0 - step(1.0, tex_non_normalized_coord.y);
  tex_non_normalized_coord.y -= 1.0 - step(-tex_size.y + 1.0, -tex_non_normalized_coord.y);
 
  const ivec2 start_coord = ivec2(tex_non_normalized_coord) + ivec2(-1, -1);
  for (int i = 0; i < 3; ++i) {
    for (int j = 0; j < 3; ++j) {
      const ivec2 coord_to_sample = start_coord + ivec2(i, j);
      const vec4 color = texelFetch(tex, coord_to_sample, lod);
      block.r_values[i*3 + j] = color.r;
      block.g_values[i*3 + j] = color.g;
      block.b_values[i*3 + j] = color.b;
      block.a_values[i*3 + j] = color.a;
    }
  }
}
 
// void insertion_sort(inout float values[9]) {
//   for (int i = 1; i < 9; ++i) {
//     int j = i;
//     while (j > 0 && values[j - 1] > values[j]) {
//       float temp = values[j];
//       values[j] = values[j - 1];
//       values[j - 1] = temp;
//       --j;
//     }
//   }
// }
 
// void selection_sort(int correct_size, inout float values[9]) {
//   for (int i = 0; i <= correct_size / 2; ++i) {
//     int candidate_index = i;
//     for (int j = i + 1; j < correct_size; ++j){ // (j < correct_size) wrong, but easy fix
//       if (values[j] < values[candidate_index]) {
//         candidate_index = j;
//       }
//     }
//     float temp = values[i];
//     values[i] = values[candidate_index];
//     values[candidate_index] = temp;
//   }
// }
 
//void network_sort(inout float values[9]) {
//  #define CMP_SWAP(a, b) if (values[a] > values[b]) {float temp = values[a]; values[a] = values[b]; values[b] = temp;}
//
//  CMP_SWAP(0, 1); CMP_SWAP(3, 4); CMP_SWAP(6, 7);
//  CMP_SWAP(1, 2); CMP_SWAP(4, 5); CMP_SWAP(7, 8);
//  CMP_SWAP(0, 1); CMP_SWAP(3, 4); CMP_SWAP(6, 7);
//  CMP_SWAP(0, 3); CMP_SWAP(3, 6); CMP_SWAP(0, 3);
//  CMP_SWAP(1, 4); CMP_SWAP(4, 7); CMP_SWAP(1, 4);
//  CMP_SWAP(5, 8); CMP_SWAP(2, 5); CMP_SWAP(5, 8);
//  CMP_SWAP(2, 4); CMP_SWAP(4, 6); CMP_SWAP(2, 4);
//  CMP_SWAP(1, 3); CMP_SWAP(2, 3);
//  CMP_SWAP(5, 7); CMP_SWAP(5, 6);
//}
 
float medianSelection(in float[9] a) {
  #define SWAP(i,j) {float tmp = min(a[i],a[j]); a[j] = max(a[i],a[j]); a[i] = tmp;}
  #define MIN(i,j) {a[i] = min(a[i],a[j]);}
  #define MAX(i,j) {a[j] = max(a[i],a[j]);}
  SWAP(0,1); SWAP(3,4); SWAP(6,7);
  SWAP(1,2); SWAP(4,5); SWAP(7,8);
  SWAP(0,1); SWAP(3,4); SWAP(6,7);
  MAX(0,3);  MAX(3,6);  // (0,3);
  SWAP(1,4);  MIN(4,7);  MAX(1,4);
  MIN(5,8);  MIN(2,5);  // (5,8);
  SWAP(2,4);  MIN(4,6);  MAX(2,4);
  // (1,3);  // (2,3);
  // (5,7);  // (5,6);
  return a[4];
}
vec4 medianFilter(const sampler2D tex, const vec2 tex_coord, int lod) { //const lod?
  BlockOfTexels3x3 block;
  fetchBlockOfTexels(tex, tex_coord, lod, block);
 
  const vec4 color = {
    medianSelection(block.r_values),
    medianSelection(block.g_values),
    medianSelection(block.b_values),
    medianSelection(block.a_values),
  };
  return color;
}
 
void main()
{
  //color = textureLod(colorTex, surf.texCoord, 0);
  color = medianFilter(colorTex, surf.texCoord, 0);
}