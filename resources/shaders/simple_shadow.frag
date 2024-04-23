#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_fragColor;
layout(location = 1) out vec4 out_ambient;
layout(location = 2) out vec4 out_historyAmbient;

layout (location = 0 ) in VS_OUT
{
  vec3 wPos;
  vec3 wNorm;
  vec3 wTangent;
  vec2 texCoord;
} surf;

layout(binding = 0, set = 0) uniform AppData
{
  UniformParams Params;
};

layout (binding = 1) uniform sampler2D shadowMap;
layout (binding = 2) uniform sampler2D depth;
layout (binding = 3) uniform sampler2D oldAmbient;

float random(vec3 pos){
    return fract(sin(dot(pos, vec3(64.25375463, 23.27536534, 86.29678483))) * 59482.7542) - 0.5;
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

  vec4 lightColor1 = mix(dark_violet, chartreuse, abs(sin(Params.time)));
  vec4 lightColor2 = vec4(1.0f, 1.0f, 1.0f, 1.0f);
   
  vec3 lightDir   = normalize(Params.lightPos - surf.wPos);
  vec4 lightColor = max(dot(surf.wNorm, lightDir), 0.0f) * lightColor1;
  out_fragColor   = (lightColor*shadow + vec4(0.1f)) * vec4(Params.baseColor, 1.0f);

  vec3 norm = normalize(surf.wNorm);
  vec3 tangent = normalize(surf.wTangent);
  vec3 bitangent = cross(norm, tangent);

  const int NUM_SAMPLES = 8;
  const float MAX_SAMPLE_DIST = 0.04f;
  float illuminatedSamplesCount = 0;
  for (int i = 0; i < NUM_SAMPLES; ++i) {
    vec3 seed = surf.wPos + Params.eyeAndJitter.w / 5.0;
    vec3 offset = normalize(abs(random(seed + vec3(i, 0, 0))) * norm + random(seed + vec3(0, i, 0)) * tangent +  random(seed + vec3(0, 0, i)) * bitangent);
    offset *= float(i)/NUM_SAMPLES;
    // offset *= float(i)/NUM_SAMPLES;
    vec3 pointToSample = surf.wPos + offset * MAX_SAMPLE_DIST;
    const vec4 posSampleClipSpace = Params.projectionViewMatrix * vec4(pointToSample, 1.0f);
    const vec3 posSampleSpaceNDC = posSampleClipSpace.xyz/posSampleClipSpace.w;
    const vec2 sampleTexCoord    = posSampleSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);
    const float viewDepth = textureLod(depth, sampleTexCoord, 0).x;
    if (posSampleClipSpace.z < viewDepth + 0.005f) {
      illuminatedSamplesCount += 1.0;
    } else {
      illuminatedSamplesCount += smoothstep(0, 0.15, posSampleClipSpace.z - viewDepth);
    }
  }
  const float ambient = illuminatedSamplesCount / NUM_SAMPLES;
  const vec4 posSampleClipSpace = Params.oldProjectionViewMatrix * vec4(surf.wPos, 1.0f);
  const vec3 posSampleSpaceNDC = posSampleClipSpace.xyz/posSampleClipSpace.w;
  const vec2 sampleTexCoord    = posSampleSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);
  const vec4 oldFragAmbient = textureLod(oldAmbient, sampleTexCoord, 0);
  // const bool  outOfOldView = (sampleTexCoord.x < 0.0001f || sampleTexCoord.x > 0.9999f || sampleTexCoord.y < 0.0091f || sampleTexCoord.y > 0.9999f);
  // float blendCoeff = 0.9;
  // vec3 col = (lightColor*shadow + vec4(0.1f)).xyz * vec4(Params.baseColor, 1.0f).xyz;
  // if (outOfOldView) {
  //   out_ambient = vec4(col, 1);
  // } else {
  //   out_ambient = vec4(col * (1 - blendCoeff) + oldFragAmbient.xyz * blendCoeff, 1);
  // }
  // out_historyAmbient = textureLod(oldAmbient, sampleTexCoord, 0);
  // out_fragColor = vec4(out_ambient.w);
  out_ambient = out_fragColor;
  out_historyAmbient = oldFragAmbient;
  // out_fragColor   = out_ambient;

}
