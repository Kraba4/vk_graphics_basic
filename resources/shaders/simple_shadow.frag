#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_fragColor;

layout (location = 0 ) in VS_OUT
{
  vec3 wPos;
  vec3 wNorm;
  vec3 wTangent;
  vec3 color;
  vec2 texCoord;
} surf;

layout(binding = 0, set = 0) uniform AppData
{
  UniformParams Params;
};

layout (binding = 1) uniform sampler2D shadowMap;
layout (binding = 2) uniform sampler2D normalMap;
layout (binding = 3) uniform sampler2D posMap;
layout (binding = 4) uniform sampler2D fluxMap;


vec2 Hammersley(float i, float numSamples)
{   
    uint b = uint(i);
    
    b = (b << 16u) | (b >> 16u);
    b = ((b & 0x55555555u) << 1u) | ((b & 0xAAAAAAAAu) >> 1u);
    b = ((b & 0x33333333u) << 2u) | ((b & 0xCCCCCCCCu) >> 2u);
    b = ((b & 0x0F0F0F0Fu) << 4u) | ((b & 0xF0F0F0F0u) >> 4u);
    b = ((b & 0x00FF00FFu) << 8u) | ((b & 0xFF00FF00u) >> 8u);
    
    float radicalInverseVDC = float(b) * 2.3283064365386963e-10;
    
    return vec2((i / numSamples), radicalInverseVDC);
} 

void main()
{
  const vec4 posLightClipSpace = Params.lightMatrix*vec4(surf.wPos, 1.0f); // 
  const vec3 posLightSpaceNDC  = posLightClipSpace.xyz/posLightClipSpace.w;    // for orto matrix, we don't need perspective division, you can remove it if you want; this is general case;
  const vec2 shadowTexCoord    = posLightSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);  // just shift coords from [-1,1] to [0,1]               
    
  const bool  outOfView = (shadowTexCoord.x < 0.0001f || shadowTexCoord.x > 0.9999f || shadowTexCoord.y < 0.0091f || shadowTexCoord.y > 0.9999f);
  const float shadow    = ((posLightSpaceNDC.z < textureLod(shadowMap, shadowTexCoord, 0).x + 0.001f) || outOfView) ? 1.0f : 0.0f;

  const vec4 dark_violet = vec4(0.59f, 0.0f, 0.82f, 1.0f);
  const vec4 chartreuse  = vec4(0.5f, 1.0f, 0.0f, 1.0f);

  // vec4 lightColor1 = mix(dark_violet, chartreuse, abs(sin(Params.time)));
  vec4 lightColor1 = vec4(1.0f, 1.0f, 1.0f, 1.0f);
   
  vec3 lightDir   = normalize(Params.lightPos - surf.wPos);
  vec4 lightColor = max(dot(surf.wNorm, lightDir), 0.0f) * lightColor1;
  vec4 directColor   = (lightColor*shadow + vec4(0.1f)) * vec4(surf.color, 1.0f);
  if (!Params.enableIndirect) {
    out_fragColor = directColor;
    return;
  }
  vec4 indirectColor = vec4(0);

  const int numSamples = 60;
  const float maxSampleRadius = 0.08;
  for (int i = 0; i < numSamples; ++i) {
    vec2 hammer = Hammersley(i, numSamples);
    float r = hammer.x * maxSampleRadius;
    float theta = hammer.y;
    vec2 rand = vec2(r * cos(theta), r * sin(theta));
    vec2 sampled_coord =  shadowTexCoord + rand; //shadowTexCoord + rand /** perlin2d(rand + surf.wPos.xy)*/ * maxSampleRadius;
    if (sampled_coord.x > 1.f || sampled_coord.y > 1.f || sampled_coord.x < 0.f || sampled_coord.y < 0.f) continue;
    vec3 sample_pos = textureLod(posMap, sampled_coord, 0).xyz;
    vec3 sample_normal = textureLod(normalMap, sampled_coord, 0).xyz;
    vec3 dir = surf.wPos.xyz - sample_pos;
    vec3 normalized_dir = normalize(dir);
    float len = length(dir);
    vec3 lightDir   = normalize(Params.lightPos - sample_pos);
    vec4 res = textureLod(fluxMap, sampled_coord, 0) 
                   * max(0, dot(sample_normal, normalized_dir))
                   * max(0, dot(normalize(surf.wNorm.xyz), -normalized_dir))
                   * max(0, dot(sample_normal, lightDir))
                   / (len * len);
    res *= hammer.x * hammer.x;
    indirectColor += res;
  }
  // indirectColor = clamp(indirectColor, 0, 1);
  out_fragColor =  directColor + 0.0065 * indirectColor;
}
