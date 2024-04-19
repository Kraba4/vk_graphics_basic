#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "unpack_attributes.h"
#include "common.h"

layout(location = 0) in vec4 vPosNorm;
layout(location = 1) in vec4 vTexCoordAndTang;

layout(push_constant) uniform params_t
{
    mat4 mProj;
    mat4 mView;
    mat4 mModel;
    int jitterStep;
} params;

layout (location = 0 ) out VS_OUT
{
    vec3 wPos;
    vec3 wNorm;
    vec3 wTangent;
    vec2 texCoord;

} vOut;

out gl_PerVertex { vec4 gl_Position; };

float halton(int base, int index)
{
	float result = 0.;
	float f = 1.;
	while (index > 0)
	{
		f = f / float(base);
		result += f * float(index % base);
		index = index / base; 
	}
	return result;
}

const float jitterStepSize = 1.0/600.0;
void main(void)
{
    const vec4 wNorm = vec4(DecodeNormal(floatBitsToInt(vPosNorm.w)),         0.0f);
    const vec4 wTang = vec4(DecodeNormal(floatBitsToInt(vTexCoordAndTang.z)), 0.0f);

    vOut.wPos     = (params.mModel * vec4(vPosNorm.xyz, 1.0f)).xyz;
    vOut.wNorm    = normalize(mat3(transpose(inverse(params.mModel))) * wNorm.xyz);
    vOut.wTangent = normalize(mat3(transpose(inverse(params.mModel))) * wTang.xyz);
    vOut.texCoord = vTexCoordAndTang.xy;

    const int stp = params.jitterStep;
    const vec4 offset = vec4(vec2(halton(2, stp), halton(3, stp)) - 0.5, 0, 0) * jitterStepSize;
    mat4 projection = params.mProj;
    projection[2][0] += offset.x;
    projection[2][1] += offset.y;

    gl_Position  = projection * params.mView * vec4(vOut.wPos, 1.0);
}
