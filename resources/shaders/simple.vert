#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "unpack_attributes.h"
#include "common.h"

layout(location = 0) in vec4 vPosNorm;
layout(location = 1) in vec4 vTexCoordAndTang;

layout(push_constant) uniform params_t
{
    mat4 mProjView;
    mat4 mModel;
    float time;
} params;

layout(binding = 0, set = 0) uniform AppData1
{
    UniformParams Params;
};

layout (location = 0 ) out VS_OUT
{
    vec3 wPos;
    vec3 wNorm;
    vec3 wTangent;
    vec2 texCoord;

} vOut;

out gl_PerVertex { vec4 gl_Position; };
void main(void)
{
    const vec4 wNorm = vec4(DecodeNormal(floatBitsToInt(vPosNorm.w)),         0.0f);
    const vec4 wTang = vec4(DecodeNormal(floatBitsToInt(vTexCoordAndTang.z)), 0.0f);

    vec3 t_pos = vPosNorm.xyz;
    mat4 model =  params.mModel;
    float sign_x = step(t_pos.x, 0);
    float sign_z = step(t_pos.z, 0);
    const float time = (params.time + Params.time) / 2.0;    // (params.time is time from pc) == (Params.time is time from uniform)
    float offset = (abs(sin(t_pos.y * 20.0 + time))) * 0.05;
    t_pos.x -= sign_x * offset - (1 - sign_x) * offset;
    t_pos.z -= sign_z * offset - (1 - sign_z) * offset;
    vOut.wPos     = (model * vec4(t_pos, 1.0f)).xyz;
    vOut.wNorm    = normalize(mat3(transpose(inverse(model))) * wNorm.xyz);
    vOut.wTangent = normalize(mat3(transpose(inverse(model))) * wTang.xyz);
    vOut.texCoord = vTexCoordAndTang.xy;

    gl_Position   = params.mProjView * vec4(vOut.wPos, 1.0);
}
