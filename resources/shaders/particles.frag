#version 450
#extension GL_ARB_separate_shader_objects : enable

layout(location = 0) out vec4 color;

layout (location = 0 ) in VS_OUT
{
  vec2 texCoord;
} surf;

void main()
{
  color = vec4(0.9922, 0.0, 0.0, max(0.5 - length(surf.texCoord - vec2(0.5)), 0) );
}
