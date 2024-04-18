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
  vec2 texCoord;
} surf;

layout(binding = 0, set = 0) uniform AppData
{
  UniformParamsForTemporal Params;
};

layout (binding = 1) uniform sampler2D shadowMap;
layout (binding = 2) uniform sampler2D oldMainView;
// layout (binding = 3) uniform sampler2D oldMainViewDepth;

const float trembleStepSizeX = 1/1024.0/2.0;
const float trembleStepSizeY = 1/1024.0/2.0;
vec4 tremble_offsets[] = { vec4(0, trembleStepSizeY * 1.5, 0, 0),
                  vec4(trembleStepSizeX, trembleStepSizeY, 0, 0), vec4(trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(0, -trembleStepSizeX * 1.5, 0, 0),
                  vec4(-trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(-trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(-trembleStepSizeX, trembleStepSizeY, 0, 0)};

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


  vec4 posOldClipSpace = Params.oldProjView*vec4(surf.wPos, 1.0f); // 
  posOldClipSpace += tremble_offsets[Params.penultTrembleStep] * posOldClipSpace.w;
  const vec3 posOldSpaceNDC  = posOldClipSpace.xyz/posOldClipSpace.w;    // for orto matrix, we don't need perspective division, you can remove it if you want; this is general case;
  const vec2 oldTexCoord    = posOldSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);  // just shift coords from [-1,1] to [0,1]               
    
  const bool  outOfOldView = (oldTexCoord.x < 0.0001f || oldTexCoord.x > 0.9999f || oldTexCoord.y < 0.0091f || oldTexCoord.y > 0.9999f);
  
  const vec4 oldColor = textureLod(oldMainView, oldTexCoord, 0);
  if (outOfOldView) {
    out_fragColor   = vec4((lightColor.xyz + vec3(0.1f)) * vec3(Params.baseColor), gl_FragCoord.z / gl_FragCoord.w);
  } else {
    float blendCoeff;
    if (abs(posOldSpaceNDC.z - oldColor.w) < 0.02) {
        blendCoeff = 0.9;
    } else {
        blendCoeff = 0.9;
    }
    // float blendCoeff = 0.9 * (1 - smoothstep(0.02, 0.02, abs(posOldSpaceNDC.z - oldColor.w)));
    // float blendCoeff = 0.9;
    vec3 blendedColor   = (lightColor.xyz + vec3(0.1f)) * vec3(Params.baseColor) * (1 - blendCoeff) + oldColor.xyz * blendCoeff;
    out_fragColor   = vec4(blendedColor, gl_FragCoord.z / gl_FragCoord.w);
  }
}
