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
  vec3 texCoordAndObjectIndex;
} surf;

layout(binding = 0, set = 0) uniform AppData
{
  UniformParams Params;
};

layout (binding = 1) uniform sampler2D shadowMap;

void main()
{
  const vec4 posLightClipSpace = Params.lightMatrix*vec4(surf.wPos, 1.0f); // 
  const vec3 posLightSpaceNDC  = posLightClipSpace.xyz/posLightClipSpace.w;    // for orto matrix, we don't need perspective division, you can remove it if you want; this is general case;
  const vec2 shadowTexCoord    = posLightSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);  // just shift coords from [-1,1] to [0,1]               
    
  const bool  outOfView = (shadowTexCoord.x < 0.0001f || shadowTexCoord.x > 0.9999f || shadowTexCoord.y < 0.0091f || shadowTexCoord.y > 0.9999f);
  const float shadow    = ((posLightSpaceNDC.z < textureLod(shadowMap, shadowTexCoord, 0).x + 0.001f) || outOfView) ? 1.0f : 0.0f;

  const vec4 dark_violet = vec4(0.59f, 0.0f, 0.82f, 1.0f);
  const vec4 chartreuse  = vec4(0.5f, 1.0f, 0.0f, 1.0f);

  vec4 lightColor1 = vec4(surf.color, 1.0f); //mix(dark_violet, chartreuse, abs(sin(0.5)));
  vec4 lightColor2 = vec4(1.0f, 1.0f, 1.0f, 1.0f);
  
  vec3 lightDir   = normalize(Params.lightPos - surf.wPos);
  vec3 viewDir    = normalize(Params.viewPos.xyz - surf.wPos);
  float diffuse = max(dot(surf.wNorm, lightDir), 0.0f);
  float reflection = pow(max(dot(surf.wNorm, normalize(lightDir + viewDir)), 0.0), 100);

  if (!Params.enableSubsurfaceScattering || surf.texCoordAndObjectIndex.z != 1) {
    out_fragColor   = ((diffuse * lightColor1)*shadow + vec4(0.1f)) * vec4(Params.baseColor, 1.0f);
    return;
  }
  // https://gamedev.ru/code/articles/Subsurface_scattering
  // ШАГ 1 : смягчаем тени
  float soften = Params.ssParams[0]; //0.15;
  float fSurfaceShadow = (1 - soften) + soften * shadow;
  diffuse    = (1 - soften) + soften * diffuse;

  // параметр, регулирующий затухание света, в зависимости от расстояния
  float fLinearAttenuation =  Params.ssParams[1]; //0.48;
  float fFalloffPower      =   Params.ssParams[2]; //5.00;   // скорость затухания
  float fLightDistance = max( 0.0, length(Params.lightPos - surf.wPos) - 4.0);
  float fScattering    = min(1.0, 2.5 / (1.0 + fLightDistance * fLinearAttenuation) );
  fScattering          = max(0.7, pow( fScattering, fFalloffPower ));

  // параметр, определяющий насколько световое пятно
  // будет сконцентрировано:
  float fLightSharpness = Params.ssParams[3]; //20.00;
  vec3 vLightTovertex   = -lightDir;
  vec3 vViewTovertex    = viewDir;
  float VdotL = max(0.0, dot(vLightTovertex, vViewTovertex));
        VdotL = pow(VdotL, fLightSharpness);

  diffuse += VdotL;
  vec4 vResult = diffuse * fSurfaceShadow * fScattering * lightColor1 + reflection * shadow;

  out_fragColor = vResult;
}
