#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_fragColor;
layout(location = 1) out vec4 out_savedFragColor;

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

// const float trembleStepSizeX = 1/1524.0/2.0;
// const float trembleStepSizeY = 1/1524.0/2.0;
// const float trembleStepSizeX = 1/1024.0/1.0;
const float trembleStepSizeX = 1.0/1024.0/2.0;
const float trembleStepSizeY = 1/1204.0/2.0;
vec4 tremble_offsets[] = {vec4(0, 0, 0, 0),  vec4(0, trembleStepSizeY * 1.5, 0, 0),
                  vec4(trembleStepSizeX, trembleStepSizeY, 0, 0), vec4(trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(0, -trembleStepSizeY * 1.5, 0, 0),
                  vec4(-trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(-trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(-trembleStepSizeX, trembleStepSizeY, 0, 0)};


float halton(int base, int index)
{
	float result = 0.;
	float f = 1.;
	while (index > 0)
	{
		f = f / float(base);
		result += f * float(index % base);
		index = index / base; 
        //index = int(floor(float(index) / float(base)));
	}
	return result;
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
  // vec4 lightColor1 = mix(dark_violet, chartreuse, abs(sin(0.5)));
  vec4 lightColor2 = vec4(1.0f, 1.0f, 1.0f, 1.0f);
   
  vec3 lightDir   = normalize(Params.lightPos - surf.wPos);
  vec4 lightColor = max(dot(surf.wNorm, lightDir), 0.0f) * lightColor1;


  mat4 projection = Params.oldProjView;
  // projection[3][0] -= tremble_offsets[int(Params.penultTrembleStep[0])].x;
  // projection[3][1] -= tremble_offsets[int(Params.penultTrembleStep[0])].y;

  vec4 posOldClipSpace = projection*vec4(surf.wPos, 1.0f); // 
  // vec4 toff= vec4(vec2(halton(2, int(Params.penultTrembleStep[0])), halton(3, int(Params.penultTrembleStep[0]))) - 0.5, 0, 0) * trembleStepSizeX;
  // posOldClipSpace += tremble_offsets[int(Params.penultTrembleStep[0])] * posOldClipSpace.w;
  // posOldClipSpace += toff * posOldClipSpace.w;
  const vec3 posOldSpaceNDC  = posOldClipSpace.xyz/posOldClipSpace.w;    
  const vec2 oldTexCoord    = posOldSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);             
    
  bool  outOfOldView = (oldTexCoord.x < 0.f || oldTexCoord.x > 1.f || oldTexCoord.y < 0.0f || oldTexCoord.y > 1.0f);
  
  // ivec2 oldCoord = ivec2(oldTexCoord.xy * 1024.0);
  vec4 oldColor = textureLod(oldMainView, oldTexCoord, 0);
  // float minDepth = texelFetch(oldMainView, oldCoord, 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(0, 1), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(1, 1), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(1, 0), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(1, -1), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(0, -1), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(-1, -1), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(-1, 0), 0).w;
  // minDepth += texelFetch(oldMainView, oldCoord + ivec2(-1, 1), 0).w;
  // minDepth /= 9.0;
  vec3 newColor = (lightColor.xyz * shadow + vec3(0.1f)) * vec3(Params.baseColor);
  if (Params.penultTrembleStep[1] == 1) {
    out_fragColor   = vec4(newColor, 1);
    out_savedFragColor = vec4(newColor, gl_FragCoord.z / gl_FragCoord.w);
    return;
  }
  if (outOfOldView) {
    out_fragColor   = vec4(newColor, 1);
    out_savedFragColor = vec4(newColor, gl_FragCoord.z / gl_FragCoord.w);
  } else {
    float blendCoeff = 0.9;
    // if (shadow == 1.0) {
    //   blendCoeff = 0.96; 
    // }
    bool isCameraMove = length(Params.ProjView[3].xyz - Params.oldProjView[3].xyz) > 10 * trembleStepSizeX;
    if (isCameraMove) {
      // blendCoeff = 0.9 * (1 - smoothstep(0.01, 0.02, abs(posOldSpaceNDC.z - minDepth)));
      blendCoeff = 0.9 * (1 - smoothstep(0.01, 0.02, abs(posOldSpaceNDC.z - oldColor.w)));
    }
    // float blendCoeff = 0.9;
    vec3 blendedColor   = newColor * (1 - blendCoeff) + oldColor.xyz * blendCoeff;
    // vec3 blendedColor = oldColor.xyz;
    // blendedColor = round(blendedColor * 10) / 10.0;
    out_fragColor   = vec4(blendedColor, 1);
    out_savedFragColor = vec4(blendedColor, gl_FragCoord.z / gl_FragCoord.w);
  }
}
