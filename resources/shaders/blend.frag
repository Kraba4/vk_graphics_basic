#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_sceneColor;
layout(location = 1) out vec4 out_savedColor;


layout (binding = 0) uniform sampler2D sceneColor;
layout (binding = 1) uniform sampler2D historyColor;
layout(binding = 2) uniform AppData
{
  UniformParamsForTemporal Params;
};

layout (location = 2) in VS_OUT
{
  vec2 texCoord;
} surf;

void main()
{
    const ivec2 cord = ivec2((surf.texCoord) * 1024.0);
    const int half_size = 1;
    const int left_x = max(cord.x - half_size, 0);
    const int right_x = min(cord.x + half_size, 1023);

    const int up_y = max(cord.y - half_size, 0);
    const int down_y = min(cord.y + half_size, 1023);

    vec4 minColor = vec4(1);
    vec4 maxColor = vec4(0);

    for (int i = up_y; i <= down_y; ++i) {
        for (int j = left_x; j <= right_x; ++j) {
            vec4 texel = texelFetch(sceneColor, ivec2(j, i), 0);
            minColor = min(minColor, texel);
            maxColor = max(maxColor, texel);
        }
    }
  
    vec4 historyTexel = texelFetch(historyColor, cord, 0);
    historyTexel = clamp(historyTexel, minColor, maxColor);
    
    float blendCoeff = 0.9;
    vec3 blendedColor = texelFetch(sceneColor, cord, 0).xyz * (1 - blendCoeff) + historyTexel.xyz * blendCoeff;
    out_sceneColor = vec4(blendedColor, 1);
    out_savedColor = vec4(blendedColor, 1);
}
