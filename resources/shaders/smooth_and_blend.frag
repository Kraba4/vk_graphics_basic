#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_sceneColor;
layout(location = 1) out vec4 out_ambient;

layout (binding = 0) uniform sampler2D ambientImage;
layout (binding = 1) uniform sampler2D mainViewColor;
layout (binding = 2) uniform sampler2D historyAmbient;

layout (location = 0) in VS_OUT
{
  vec2 texCoord;
} surf;

// vec3 kernel[3] = { vec3(1.0, 2.0, 1.0), vec3(2.0, 4.0, 2.0), vec3(1.0, 2.0, 1.0)};
vec3 kernel[3] = { vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0)};
void main()
{
    ivec2 cord = ivec2((surf.texCoord) * 1024.0);
    const int half_size = 1;
    const int left_x = max(cord.x - half_size, 0);
    const int right_x = min(cord.x + half_size, 1023);

    const int up_y = max(cord.y - half_size, 0);
    const int down_y = min(cord.y + half_size, 1023);

    vec4 minColor = vec4(1);
    vec4 maxColor = vec4(0);

    for (int i = up_y; i <= down_y; ++i) {
        for (int j = left_x; j <= right_x; ++j) {
            vec4 texel = texelFetch(ambientImage, ivec2(j, i), 0);
            minColor = min(minColor, texel);
            maxColor = max(maxColor, texel);
        }
    }
    vec4 historyTexel = texelFetch(historyAmbient, cord, 0);
    historyTexel = clamp(historyTexel, minColor, maxColor);

    float blendCoeff = 0.9;
    vec4 blendedColor = vec4(texelFetch(ambientImage, cord, 0)) * (1 - blendCoeff) + historyTexel * blendCoeff;
    // // out_sceneColor = vec4(blendedColor, 1);
    // // out_savedColor = vec4(blendedColor, 1);
    // out_sceneColor = texelFetch(mainViewColor, cord, 0) * blendedColor.x;
    out_sceneColor = blendedColor;
    out_ambient = blendedColor;
    // out_ambient = blendedColor;
    // out_sceneColor = vec4(texelFetch(ambientImage, cord + 3, 0).x);
    // out_sceneColor = vec4(texelFetch(ambientImage, cord, 0).x);
    // out_sceneColor = vec4(1);
    // float r = 4.0;
    // float xs = 1024;
    // float ys = 1024;
    // float x,y,xx,yy,rr=r*r,dx,dy,w,w0;
    // w0=0.3780/pow(r,1.975);
    // vec2 p;
    // vec4 col=vec4(0.0,0.0,0.0,0.0);
    // vec2 pos = (surf.texCoord - 0.5) * 2.0;
    // for (dx=1.0/xs,x=-r,p.x=0.5+(pos.x*0.5)+(x*dx);x<=r;x++,p.x+=dx){ xx=x*x;
    //  for (dy=1.0/ys,y=-r,p.y=0.5+(pos.y*0.5)+(y*dy);y<=r;y++,p.y+=dy){ yy=y*y;
    //   if (xx+yy<=rr)
    //     {
    //     w=w0*exp((-xx-yy)/(2.0*rr));
    //     col+=textureLod(ambientImage,p, 0)*w;
    //     }}}
    // // gl_FragColor=col;
    // out_sceneColor = vec4(col.x);

}