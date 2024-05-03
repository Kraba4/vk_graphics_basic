#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_sceneColor;

layout(binding = 0) uniform AppData
{
  UniformParams Params;
};
layout (binding = 1) uniform sampler2D hdrImage;

layout (location = 1) in VS_OUT
{
  vec2 texCoord;
} surf;

float tonemapUnreal(float x) {
    return x / (x + 0.155) * 1.019;
}

float tonemapFilmic(float x) {
    x = max(0.f, x - 0.004);
    return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
}

void main()
{
    vec4 color = textureLod(hdrImage, surf.texCoord, 0);
    if (Params.toneMapping == 1) {
        color = vec4(tonemapUnreal(color.r), tonemapUnreal(color.g), tonemapUnreal(color.b), 1.0);
    } else if (Params.toneMapping == 2){
        color = vec4(tonemapFilmic(color.r), tonemapFilmic(color.g), tonemapFilmic(color.b), 1.0);
    }
    // else automatic clamp [0, 1]
    out_sceneColor = color;
}