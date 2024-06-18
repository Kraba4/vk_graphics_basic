#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "unpack_attributes.h"
#include "common.h"

layout(std430, binding = 0) buffer a 
{
    Particle particles[];
};

layout(push_constant) uniform params_t
{
    mat4 mProjView;
    vec4 rightAndIndex;
    vec4 upAndSize;
} params;


layout (location = 0 ) out VS_OUT
{
    vec4 pos;
    vec4 texCoord;
    vec4 viewportCoord;
} vOut;

out gl_PerVertex { vec4 gl_Position; };

vec2 quad[6] = {vec2(-1,1), vec2(1, 1), vec2(1, -1),
                vec2(-1,1), vec2(1, -1), vec2(-1,-1)};

vec2 quad2[3] = {vec2(-1, -1), vec2(3, -1), vec2(-1, 3)};
void main(void)
{
    const uint index = uint(params.rightAndIndex.w);
    const vec4 positionAndTimeToLive = particles[index].positionAndTimeToLive;
    vec3 centerPos = positionAndTimeToLive.xyz;
    if (positionAndTimeToLive.w <= 0 ||  particles[index].spawner.x > 0) {
        // gl_Position = vec4(1000, 1000, 1000, 1);
        centerPos = vec3(1000, 1000, 0);
    }
    const vec2 corner = quad2[gl_VertexIndex];
    float size =  particles[index].spawner.z == -1 ? 0.06  - particles[index].spawner.w * 0.02: 0.02;
    size *= 2.0;
    const vec3 right = params.rightAndIndex.xyz;
    const vec3 up = params.upAndSize.xyz;
    vec3 pos = centerPos + size * (corner.x * right + corner.y * up);
    vOut.texCoord.xy = corner * 0.5 + 0.5;
    vOut.texCoord.z = particles[index].spawner.z == -1 ? particles[index].spawner.w : 2;
    gl_Position   = params.mProjView * vec4(pos, 1.0);
    vec3 ndc = gl_Position.xyz / gl_Position.w; 
    vec2 viewportCoord = ndc.xy * 0.5 + 0.5; 
    vOut.viewportCoord = vec4(viewportCoord, 0, 0);
}
