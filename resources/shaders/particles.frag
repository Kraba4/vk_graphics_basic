#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"
layout(location = 0) out vec4 color;

layout (location = 0 ) in VS_OUT
{
  vec4 pos;
  vec4 texCoord;
  vec4 viewportCoord;
} surf;

layout (binding = 1) uniform sampler2D normals;
layout (binding = 2) uniform sampler2D positions;
layout (binding = 3) uniform AppData
{
  ColorParams Params;
};

void main()
{
  float len = length(surf.texCoord.xy - vec2(0.5));
  float alpha = max(0.25 - len, 0);
  vec3 particleColor = surf.texCoord.z == 0 ? Params.color1.xyz //vec3(0.2627, 0.0, 0.9922)
                                            : surf.texCoord.z == 1 ? Params.color2.xyz//vec3(0.051, 0.8118, 1.0)
                                            : Params.color3.xyz;//vec3(1, 0.9922, 1.0);
  if (len > 0.25 && len < 0.5) {
    vec2 viewportCoord = surf.viewportCoord.xy;
    vec4 lightColor1 = vec4(particleColor, 1.0f);//vec4(0.5f);  // mix(dark_violet, chartreuse, abs(sin(0.5)));
    vec3 dirPos = surf.pos.xyz - textureLod(positions, viewportCoord, 0).xyz;
    vec3 lightDir   = normalize(dirPos);
    vec4 lightColor = max(dot(textureLod(normals, viewportCoord, 0).xyz, lightDir), 0.0f) * lightColor1;
    color = vec4(lightColor.xyz + vec3(0.1f), length(dirPos) - 2);// * vec4(Params.baseColor, 1.0f);
  } else {
    color = vec4(particleColor, alpha * 4);
  }
}
