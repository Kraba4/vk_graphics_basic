#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_sceneColor;
layout(location = 1) out vec4 out_ambient;

layout (binding = 0) uniform sampler2D ambientImage;
layout (binding = 1) uniform sampler2D mainViewColor;
layout (binding = 2) uniform sampler2D historyAmbient;

layout (location = 2) in VS_OUT
{
  vec2 texCoord;
} surf;


void main()
{
    ivec2 cord = ivec2((surf.texCoord) * 1024.0);
    // const int half_size = 1;
    // const int left_x = max(cord.x - half_size, 0);
    // const int right_x = min(cord.x + half_size, 1023);

    // const int up_y = max(cord.y - half_size, 0);
    // const int down_y = min(cord.y + half_size, 1023);

    // vec4 minColor = vec4(1);
    // vec4 maxColor = vec4(0);
    // float sumNew = 0;
    // float sumOld = 0;
    // for (int i = up_y; i <= down_y; ++i) {
    //     for (int j = left_x; j <= right_x; ++j) {
    //         vec4 texel = texelFetch(ambientImage, ivec2(j, i), 0);
    //         minColor = min(minColor, texel);
    //         maxColor = max(maxColor, texel);
    //         sumNew += texel.x;
    //         texel = texelFetch(historyAmbient, ivec2(j, i), 0);
    //         sumOld += texel.x;
    //     }
    // }
    // sumNew /= (down_y - up_y + 1) * (right_x - left_x + 1);
    // sumOld /= (down_y - up_y + 1) * (right_x - left_x + 1);
    // // vec4 historyTexel = texelFetch(historyAmbient, cord, 0);
    // float historyTexel = clamp(sumOld, minColor.x, maxColor.x);

    // float blendCoeff = 0.9;
    // // vec3 blendedColor = texelFetch(ambientImage, cord, 0).xyz * (1 - blendCoeff) + historyTexel.xyz * blendCoeff;
    // vec3 blendedColor = vec3(sumNew * (1 - blendCoeff) + historyTexel * blendCoeff);
    // // // out_sceneColor = vec4(blendedColor, 1);
    // // // out_savedColor = vec4(blendedColor, 1);
    // // out_sceneColor = texelFetch(mainViewColor, cord, 0) * blendedColor.x;
    
    out_ambient = vec4(1);
    out_sceneColor = texelFetch(mainViewColor, cord, 0);
    // out_sceneColor =  texelFetch(mainViewColor, cord, 0) * out_ambient.x;
    // out_sceneColor = texelFetch(mainViewColor, cord, 0) * out_ambient;
    // out_sceneColor = vec4(texelFetch(ambientImage, cord + 3, 0).x);
    // out_sceneColor = vec4(texelFetch(ambientImage, cord, 0).x);

}