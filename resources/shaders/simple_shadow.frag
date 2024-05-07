#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "common.h"

layout(location = 0) out vec4 out_fragColor;
layout(location = 1) out vec4 out_history;

layout (location = 0 ) in VS_OUT
{
  vec3 wPos;
  vec3 wNorm;
  vec3 wTangent;
  vec3 color;
  vec2 texCoord;
} surf;

layout(binding = 0, set = 0) uniform AppData
{
  UniformParams Params;
};

layout (binding = 1) uniform sampler2D shadowMap;
layout (binding = 2) uniform sampler2D normalMap;
layout (binding = 3) uniform sampler2D posMap;
layout (binding = 4) uniform sampler2D fluxMap;
layout (binding = 5) uniform sampler2D oldIndirect;

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

// float random(vec3 pos){
//     return fract(sin(dot(pos, vec3(64.25375463, 23.27536534, 86.29678483))) * 59482.7542) - 0.5;
// }

vec2 poissonDisk[64] = {
 vec2(-0.613392, 0.617481),
 vec2(0.170019, -0.040254),
vec2(-0.299417, 0.791925),
vec2(0.645680, 0.493210),
vec2(-0.651784, 0.717887),
vec2(0.421003, 0.027070),
vec2(-0.817194, -0.271096),
vec2(-0.705374, -0.668203),
vec2(0.977050, -0.108615),
vec2(0.063326, 0.142369),
 vec2(0.203528, 0.214331),
vec2(-0.667531, 0.326090),
vec2(-0.098422, -0.295755),
 vec2(-0.885922, 0.215369),
 vec2(0.566637, 0.605213),
vec2(0.039766, -0.396100),
 vec2(0.751946, 0.453352),
 vec2(0.078707, -0.715323),
 vec2(-0.075838, -0.529344),
 vec2(0.724479, -0.580798),
 vec2(0.222999, -0.215125),
 vec2(-0.467574, -0.405438),
 vec2(-0.248268, -0.814753),
vec2(0.354411, -0.887570),
vec2(0.175817, 0.382366),
 vec2(0.487472, -0.063082),
 vec2(-0.084078, 0.898312),
 vec2(0.488876, -0.783441),
 vec2(0.470016, 0.217933),
 vec2(-0.696890, -0.549791),
 vec2(-0.149693, 0.605762),
 vec2(0.034211, 0.979980),
 vec2(0.503098, -0.308878),
 vec2(-0.016205, -0.872921),
 vec2(0.385784, -0.393902),
 vec2(-0.146886, -0.859249),
 vec2(0.643361, 0.164098),
 vec2(0.634388, -0.049471),
 vec2(-0.688894, 0.007843),
 vec2(0.464034, -0.188818),
 vec2(-0.440840, 0.137486),
 vec2(0.364483, 0.511704),
 vec2(0.034028, 0.325968),
 vec2(0.099094, -0.308023),
 vec2(0.693960, -0.366253),
 vec2(0.678884, -0.204688),
 vec2(0.001801, 0.780328),
 vec2(0.145177, -0.898984),
 vec2(0.062655, -0.611866),
 vec2(0.315226, -0.604297),
 vec2(-0.780145, 0.486251),
 vec2(-0.371868, 0.882138),
 vec2(0.200476, 0.494430),
vec2(-0.494552, -0.711051),
 vec2(0.612476, 0.705252),
 vec2(-0.578845, -0.768792),
 vec2(-0.772454, -0.090976),
 vec2(0.504440, 0.372295),
 vec2(0.155736, 0.065157),
 vec2(0.391522, 0.849605),
 vec2(-0.620106, -0.328104),
 vec2(0.789239, -0.419965),
 vec2(-0.545396, 0.538133),
 vec2(-0.178564, -0.596057)};

float random(vec3 pos){
    return fract(sin(dot(pos, vec3(64.25375463, 23.27536534, 86.29678483))) * 59482.7542);
}

// float random(vec2 co)
// {
//     float a = 12.9898;
//     float b = 78.233;
//     float c = 43758.5453;
//     float dt= dot(co.xy ,vec2(a,b));
//     float sn= mod(dt,3.14);
//     return fract(sin(sn) * c);
// }


// vec2 randomDir(vec2 pos) {
//     int type = int(random(vec3(pos, 1)) * 4.0);
//     if (type == 0) return vec2(1, 0);
//     if (type == 1) return vec2(-1, 0);
//     if (type == 2) return vec2(0, 1);
//     if (type == 3) return vec2(0, -1);
//     // if (type == 4) return vec3(0, 0, 1);
//     // if (type == 5) return vec3(0, 0, -1);
// }

// float lerp(float x1, float x2, float t) {
//    return x1 * (1.0 - t) + x2 * t;
// }

// float quantic(float t) {
//  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
// }

// float perlin2d(vec2 pos) {
//     float origX = floor(pos.x);
//     float origY = floor(pos.y);
//     // float origZ = floor(pos.z);
//     // float origZ = 0.0;
//     float x = pos.x - origX;
//     float y = pos.y - origY;
//     // float z = pos.z - origZ;

//     vec2 p000 = vec2(origX, origY);
//     vec2 p100 = vec2(origX + 1.0, origY);
//     vec2 p010 = vec2(origX, origY + 1.0);
//     // vec3 p001 = vec3(origX, origY, origZ + 1.0);
//     vec2 p110 = vec2(origX + 1.0, origY + 1.0);
//     // vec3 p011 = vec3(origX, origY + 1.0, origZ + 1.0);
//     // vec3 p101 = vec3(origX + 1.0, origY, origZ + 1.0);
//     // vec3 p111 = vec3(origX + 1.0, origY + 1.0, origZ + 1.0);

//     vec2 g000 = randomDir(p000);
//     vec2 g100 = randomDir(p100);
//     vec2 g010 = randomDir(p010);
//     // vec3 g001 = randomDir(p001);
//     vec2 g110 = randomDir(p110);
//     // vec3 g011 = randomDir(p011);
//     // vec3 g101 = randomDir(p101);
//     // vec3 g111 = randomDir(p111);

//     float d000 = dot(pos - p000, g000);
//     float d100 = dot(pos - p100, g100);
//     float d010 = dot(pos - p010, g010);
//     // float d001 = dot(pos - p001, g001);
//     float d110 = dot(pos - p110, g110);
//     // float d011 = dot(pos - p011, g011);
//     // float d101 = dot(pos - p101, g101);
//     // float d111 = dot(pos - p111, g111);

//     x = quantic(x);
//     y = quantic(y);
//     // z = quantic(z);

//     float lx1 = lerp(d000, d100, x);
//     float lx2 = lerp(d010, d110, x);
//     // float lx3 = lerp(d001, d101, x);
//     // float lx4 = lerp(d011, d111, x);

//     float ly1 = lerp(lx1, lx2, y);
//     // float ly2 = lerp(lx3, lx4, y);

//     // float lz1 = lerp(ly1, ly2, z);
//     float positive = step(0, ly1);
//     return positive;
//     //return lerp(lx1, lx2, y);
// }

// float light_attenuation(vec3 frag_pos) {
//   vec3 L = normalize(Params.lightPosm - frag_pos);
//   float theta = dot(L, normalize(-))
// }

float hdr(float x) {
  return x / (x + 1.0f);
}
void main()
{
  const vec4 posLightClipSpace = Params.lightMatrix*vec4(surf.wPos, 1.0f); // 
  const vec3 posLightSpaceNDC  = posLightClipSpace.xyz/posLightClipSpace.w;    // for orto matrix, we don't need perspective division, you can remove it if you want; this is general case;
  const vec2 shadowTexCoord    = posLightSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);  // just shift coords from [-1,1] to [0,1]               
    
  const bool  outOfView = (shadowTexCoord.x < 0.0001f || shadowTexCoord.x > 0.9999f || shadowTexCoord.y < 0.0091f || shadowTexCoord.y > 0.9999f);
  const float shadow    = ((posLightSpaceNDC.z < textureLod(shadowMap, shadowTexCoord, 0).x + 0.001f) || outOfView) ? 1.0f : 0.0f;

  const vec4 dark_violet = vec4(0.59f, 0.0f, 0.82f, 1.0f);
  const vec4 chartreuse  = vec4(0.5f, 1.0f, 0.0f, 1.0f);

  // vec4 lightColor1 = mix(dark_violet, chartreuse, abs(sin(Params.time)));
  vec4 lightColor1 = vec4(1.0f, 1.0f, 1.0f, 1.0f);
   
  vec3 lightDir   = normalize(Params.lightPos - surf.wPos);
  vec4 lightColor = max(dot(surf.wNorm, lightDir), 0.0f) * lightColor1;
  vec4 directColor   = (lightColor*shadow + vec4(0.1f)) * vec4(surf.color, 1.0f);
  vec4 indirectColor = vec4(0);

  const int numSamples = 10;
  const float maxSampleRadius = 0.1;
  for (int i = 0; i < numSamples; ++i) {
    // vec2 rand = poissonDisk[i];
    // rand = rand * rand;
    // vec2 rand = vec2(random(vec2(i + numSamples) + surf.wPos.xy), random(vec2(i + numSamples) + surf.wPos.xy));
    vec2 rand = (vec2(random(vec3(i, mod(floor(Params.jitter),64), i) + surf.wPos.xyz), random(vec3(mod(floor(Params.jitter), 64), i + 10, mod(floor(Params.jitter), 64)) + surf.wPos.xyz)) - 0.5f) * 2.f;
    vec2 sampled_coord =  shadowTexCoord + maxSampleRadius * rand; //shadowTexCoord + rand /** perlin2d(rand + surf.wPos.xy)*/ * maxSampleRadius;
    if (sampled_coord.x > 1.f || sampled_coord.y > 1.f || sampled_coord.x < 0.f || sampled_coord.y < 0.f) continue;
    vec3 sample_pos = textureLod(posMap, sampled_coord, 0).xyz;
    vec3 dir = surf.wPos.xyz - sample_pos;
    vec3 normalized_dir = normalize(dir);
    vec4 res;
    // const vec4 posLightClipSpace = Params.lightMatrix*vec4(sample_pos, 1.0f); // 
    // const vec3 posLightSpaceNDC  = posLightClipSpace.xyz/posLightClipSpace.w;    // for orto matrix, we don't need perspective division, you can remove it if you want; this is general case;
    // const vec2 shadowTexCoord    = posLightSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);  // just shift coords from [-1,1] to [0,1]               
    // const bool  outOfView = (shadowTexCoord.x < 0.0001f || shadowTexCoord.x > 0.9999f || shadowTexCoord.y < 0.0091f || shadowTexCoord.y > 0.9999f);
    // const float shadow    = ((posLightSpaceNDC.z < textureLod(shadowMap, shadowTexCoord, 0).x + 0.001f) || outOfView) ? 1.0f : 0.0f;
    res = textureLod(fluxMap, sampled_coord, 0) 
                   * max(0, dot(textureLod(normalMap, sampled_coord, 0).xyz, normalized_dir))
                   * max(0, dot(normalize(surf.wNorm.xyz), -normalized_dir))
                  //  * dot(rand, rand);
                   / length(dir);
    // res *= rand.x * rand.x;
    indirectColor += res;
  }
  indirectColor = vec4(hdr(indirectColor.x), hdr(indirectColor.y), hdr(indirectColor.z), 1.0);
  // indirectColor /= 20.f;
  indirectColor = clamp(indirectColor, 0, 1);
  float blend_coeff = 0.95;
  // vec2 texCoord = surf.texCoord;
  // texCoord.y = -texCoord.y;
  {
  const vec4 posLightClipSpace = Params.oldMatrix*vec4(surf.wPos, 1.0f); // 
  const vec3 posLightSpaceNDC  = posLightClipSpace.xyz/posLightClipSpace.w;    // for orto matrix, we don't need perspective division, you can remove it if you want; this is general case;
  const vec2 shadowTexCoord    = posLightSpaceNDC.xy*0.5f + vec2(0.5f, 0.5f);  // just shift coords from [-1,1] to [0,1]    
  vec4 c = textureLod(oldIndirect, shadowTexCoord, 0) * blend_coeff + indirectColor * (1-blend_coeff);
  out_fragColor =  directColor + 0.2 * c;
  out_history = c;
  }
  // out_fragColor = indirectColor;
  // if (outOfView) {
  //   out_fragColor = vec4(0);
  // } else {
  //   out_fragColor = textureLod(fluxMap, shadowTexCoord, 0);
  // }
}
