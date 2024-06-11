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
    vec2 texCoord;
} vOut;

out gl_PerVertex { vec4 gl_Position; };

vec2 quad[6] = {vec2(-1,1), vec2(1, 1), vec2(1, -1),
                vec2(-1,1), vec2(1, -1), vec2(-1,-1)};
void main(void)
{
    const uint index = uint(params.rightAndIndex.w);
    if (particles[index].positionAndTimeToLive.w <= 0) {
        gl_Position = vec4(1000, 1000, 1000, 1);
        return;
    }
    const vec3 centerPos = particles[index].positionAndTimeToLive.xyz;
    const vec2 corner = quad[gl_VertexIndex];
    const float size = 0.1;
    const vec3 right = params.rightAndIndex.xyz;
    const vec3 up = params.upAndSize.xyz;
    vec3 pos = centerPos + size * (corner.x * right + corner.y * up);
    vOut.texCoord = corner * 0.5 + 0.5;

    gl_Position   = params.mProjView * vec4(pos, 1.0);
}
