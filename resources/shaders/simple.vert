#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "unpack_attributes.h"


layout(location = 0) in vec4 vPosNorm;
layout(location = 1) in vec4 vTexCoordAndTang;

layout(push_constant) uniform params_t
{
    mat4 mProjView;
    mat4 mModel;
    int trembleStep;
} params;


layout (location = 0 ) out VS_OUT
{
    vec3 wPos;
    vec3 wNorm;
    vec3 wTangent;
    vec2 texCoord;

} vOut;

out gl_PerVertex { vec4 gl_Position; };
const float trembleStepSizeX = 1/1024.0/2.0;
const float trembleStepSizeY = 1/1024.0/2.0;
vec4 tremble_offsets[] = { vec4(0, trembleStepSizeY * 1.5, 0, 0),
                  vec4(trembleStepSizeX, trembleStepSizeY, 0, 0), vec4(trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(0, -trembleStepSizeX * 1.5, 0, 0),
                  vec4(-trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(-trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(-trembleStepSizeX, trembleStepSizeY, 0, 0)};
// vec4 tremble_offsets[] = {vec4(0, 0, 0, 0), 
// float random(vec3 pos){
//     return fract(sin(dot(pos, vec3(64.25375463, 23.27536534, 86.29678483))) * 59482.7542);
// }
void main(void)
{
    const vec4 wNorm = vec4(DecodeNormal(floatBitsToInt(vPosNorm.w)),         0.0f);
    const vec4 wTang = vec4(DecodeNormal(floatBitsToInt(vTexCoordAndTang.z)), 0.0f);

    vOut.wPos     = (params.mModel * vec4(vPosNorm.xyz, 1.0f)).xyz;
    vOut.wNorm    = normalize(mat3(transpose(inverse(params.mModel))) * wNorm.xyz);
    vOut.wTangent = normalize(mat3(transpose(inverse(params.mModel))) * wTang.xyz);
    vOut.texCoord = vTexCoordAndTang.xy;

    gl_Position   = params.mProjView * vec4(vOut.wPos, 1.0);
    // gl_Position += vec4(trembleStepSizeX * random(vec3(params.trembleStep, vOut.wPos.xy)).x, trembleStepSizeX * random(vec3(vOut.wPos.zy, params.trembleStep)).x, 0, 0) * gl_Position.w;
    gl_Position += tremble_offsets[params.trembleStep] * gl_Position.w;
}
