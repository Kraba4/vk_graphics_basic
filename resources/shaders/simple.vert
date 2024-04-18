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
const float trembleStepSizeX = 1.0/800.0;
const float trembleStepSizeY = 1.0/1204.0/2.0;
vec4 tremble_offsets[] = { vec4(0, 0, 0, 0), vec4(0, trembleStepSizeY * 1.5, 0, 0),
                  vec4(trembleStepSizeX, trembleStepSizeY, 0, 0), vec4(trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(0, -trembleStepSizeY * 1.5, 0, 0),
                  vec4(-trembleStepSizeX, -trembleStepSizeY, 0, 0), vec4(-trembleStepSizeX * 1.5, 0, 0, 0),
                  vec4(-trembleStepSizeX, trembleStepSizeY, 0, 0)};



float halton(int base, int index)
{
	float result = 0.;
	float f = 1.;
	while (index > 0)
	{
		f = f / float(base);
		result += f * float(index % base);
		index = index / base; 
        //index = int(floor(float(index) / float(base)));
	}
	return result;
}
// vec4 tremble_offsets[] = {vec4(0, 0, 0, 0), 
// float random(vec3 pos){
//     return fract(sin(dot(pos, vec3(64.25375463, 23.27536534, 86.29678483))) * 59482.7542);
// }
void main(void)
{
    const vec4 wNorm = vec4(DecodeNormal(floatBitsToInt(vPosNorm.w)),         0.0f);
    const vec4 wTang = vec4(DecodeNormal(floatBitsToInt(vTexCoordAndTang.z)), 0.0f);

    // mat4 projection = params.mProjView;
    // projection[3][0] += tremble_offsets[params.trembleStep].x;
    // projection[3][1] += tremble_offsets[params.trembleStep].y;
    vOut.wPos     = (params.mModel * vec4(vPosNorm.xyz, 1.0f)).xyz;
    vOut.wNorm    = normalize(mat3(transpose(inverse(params.mModel))) * wNorm.xyz);
    vOut.wTangent = normalize(mat3(transpose(inverse(params.mModel))) * wTang.xyz);
    vOut.texCoord = vTexCoordAndTang.xy;

    gl_Position   = params.mProjView * vec4(vOut.wPos, 1.0);
    // gl_Position += vec4(trembleStepSizeX * random(vec3(params.trembleStep, vOut.wPos.xy)).x, trembleStepSizeX * random(vec3(vOut.wPos.zy, params.trembleStep)).x, 0, 0) * gl_Position.w;
    vec4 toff= vec4(vec2(halton(2, params.trembleStep), halton(3, params.trembleStep)) - 0.5, 0, 0) * trembleStepSizeX;
    // vec4 toff= vec4(vec2(halton(2, 0), halton(3, 0)) - 0.5, 0, 0) * trembleStepSizeX;
    // gl_Position += tremble_offsets[params.trembleStep] * gl_Position.w;
    gl_Position += toff * gl_Position.w;
}
