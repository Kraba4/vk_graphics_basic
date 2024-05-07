#version 450

layout(location = 0) out vec4 out_normalMap;
layout(location = 1) out vec4 out_posMap;
layout(location = 2) out vec4 out_fluxMap;

layout (location = 0 ) in VS_OUT
{
  vec3 wPos;
  vec3 wNorm;
  vec3 wTangent;
  vec3 color;
  vec2 texCoord;
} surf;

void main()
{
  out_normalMap = vec4(normalize(surf.wNorm), 1);
  out_posMap    = vec4(surf.wPos, 1);
  out_fluxMap   = vec4(surf.color, 1);
}
