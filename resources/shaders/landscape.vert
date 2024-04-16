#version 450
#extension GL_ARB_separate_shader_objects : enable
#extension GL_GOOGLE_include_directive : require

#include "unpack_attributes.h"


float random(vec3 pos){
    return fract(sin(dot(pos, vec3(64.25375463, 23.27536534, 86.29678483))) * 59482.7542);
}

vec2 randomDir(vec2 pos) {
    int type = int(random(vec3(pos, 1)) * 4.0);
    if (type == 0) return vec2(1, 0);
    if (type == 1) return vec2(-1, 0);
    if (type == 2) return vec2(0, 1);
    if (type == 3) return vec2(0, -1);
    // if (type == 4) return vec3(0, 0, 1);
    // if (type == 5) return vec3(0, 0, -1);
}

float lerp(float x1, float x2, float t) {
   return x1 * (1.0 - t) + x2 * t;
}

float quantic(float t) {
 return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

layout(push_constant) uniform params_t
{
    mat4 mProjView;
    vec4 leftForwardCorner;
    vec4 rightBackCorner;
    vec3 rowSizeMinMaxHeight;
} params;


layout (location = 0 ) out VS_OUT
{
    vec3 wPos;
    vec3 wNorm;
    vec3 wTangent;
    vec2 texCoord;
} vOut;

out gl_PerVertex { vec4 gl_Position; };

float perlin2d(vec2 pos) {
    float origX = floor(pos.x);
    float origY = floor(pos.y);
    // float origZ = floor(pos.z);
    // float origZ = 0.0;
    float x = pos.x - origX;
    float y = pos.y - origY;
    // float z = pos.z - origZ;
    
    vec2 p000 = vec2(origX, origY);
    vec2 p100 = vec2(origX + 1.0, origY);
    vec2 p010 = vec2(origX, origY + 1.0);
    // vec3 p001 = vec3(origX, origY, origZ + 1.0);
    vec2 p110 = vec2(origX + 1.0, origY + 1.0);
    // vec3 p011 = vec3(origX, origY + 1.0, origZ + 1.0);
    // vec3 p101 = vec3(origX + 1.0, origY, origZ + 1.0);
    // vec3 p111 = vec3(origX + 1.0, origY + 1.0, origZ + 1.0);
    
    vec2 g000 = randomDir(p000);
    vec2 g100 = randomDir(p100);
    vec2 g010 = randomDir(p010);
    // vec3 g001 = randomDir(p001);
    vec2 g110 = randomDir(p110);
    // vec3 g011 = randomDir(p011);
    // vec3 g101 = randomDir(p101);
    // vec3 g111 = randomDir(p111);
    
    float d000 = dot(pos - p000, g000);
    float d100 = dot(pos - p100, g100);
    float d010 = dot(pos - p010, g010);
    // float d001 = dot(pos - p001, g001);
    float d110 = dot(pos - p110, g110);
    // float d011 = dot(pos - p011, g011);
    // float d101 = dot(pos - p101, g101);
    // float d111 = dot(pos - p111, g111);
    
    x = quantic(x);
    y = quantic(y);
    // z = quantic(z);
    
    float lx1 = lerp(d000, d100, x);
    float lx2 = lerp(d010, d110, x);
    // float lx3 = lerp(d001, d101, x);
    // float lx4 = lerp(d011, d111, x);
    
    float ly1 = lerp(lx1, lx2, y);
    // float ly2 = lerp(lx3, lx4, y);
    
    // float lz1 = lerp(ly1, ly2, z);
    float positive = step(0, ly1);
    return ly1 * positive * params.rowSizeMinMaxHeight[2] + ly1 * (1 - positive) * params.rowSizeMinMaxHeight[1];
    //return lerp(lx1, lx2, y);
}

void main(void)
{
    vec3 point;
    float xmax = params.rightBackCorner.x - params.leftForwardCorner.x;
    float zmax = params.rightBackCorner.z - params.leftForwardCorner.z;

    int indexQuad = gl_VertexIndex / 6;
    int row_size = int(params.rowSizeMinMaxHeight[0]);
    const vec3 units = vec3((1.0 / row_size) * xmax, 0.0, (1.0 / row_size) * zmax);

    int type = int(mod(gl_VertexIndex, 6));
    if (type == 0 || type == 3) {
        point = params.leftForwardCorner.xyz + vec3(mod(indexQuad, row_size), 0, indexQuad / row_size) * units;
    } else if (type == 2 || type == 5) {
        point = params.leftForwardCorner.xyz + vec3(mod(indexQuad, row_size) + 1, 0, indexQuad / row_size + 1) * units;
    } else {
        float odd = step(0.5, mod(gl_VertexIndex, 2));
        point = params.leftForwardCorner.xyz + vec3(mod(indexQuad, row_size) + (1 - odd), 0, floor(indexQuad / row_size) + odd) * units;
    }
    

    point.y += perlin2d(point.xz);


    vOut.wPos     = point;
    vOut.wNorm    = normalize(vec3((perlin2d(point.xz - vec2(0.05, 0)) - perlin2d(point.xz + vec2(0.05, 0))) / 0.1, 1, (perlin2d(point.xz - vec2(0, 0.05)) - perlin2d(point.xz + vec2(0, 0.05))) / 0.1));
    // vOut.wNorm = vec3(0, 1, 0);
    gl_Position   = params.mProjView * vec4(point, 1.0);
}
