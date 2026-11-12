/**
 * The foil pack's shaders (WebGL 1). The fragment shader draws the whole pack in one pass:
 * the printed artwork (a texture) shaded as crinkled, crimped foil lit from `uLight` with a
 * faint hologram sheen, the torn edge, and the torn-off strip (rotated about the cut point,
 * then flying away). Everything is in CSS pixels of the canvas; `uDpr` converts from pixels.
 */
export const VERTEX_SHADER = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

export const FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uDpr;uniform sampler2D uArt;uniform vec4 uPack;',
    'uniform float uTearY;uniform float uCut;uniform float uTheta;uniform float uFly;uniform vec2 uLight;uniform float uTime;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}',
    'float edgeY(float x){return uTearY+(noise(vec2(x*.42,3.7))-.5)*7.+(noise(vec2(x*1.9,9.1))-.5)*3.;}',
    'float rbox(vec2 p,vec2 c,vec2 h,float r){vec2 q=abs(p-c)-h+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
    'vec3 env(vec3 R,vec3 L){',
    '  float sky=smoothstep(-.6,.9,R.y);',
    '  vec3 c=mix(vec3(.04,.05,.08),vec3(.46,.52,.62),sky);',
    '  float d=max(dot(R,L),0.);',
    '  c+=vec3(1.,.97,.9)*pow(d,26.)*.9+vec3(.6,.7,1.)*pow(d,5.)*.14;',
    '  c+=vec3(.9)*smoothstep(.55,.62,sin(R.x*5.+R.y*3.+1.)*.5+.5)*.16;',
    '  return c;}',
    'vec3 shade(vec2 s){',
    '  vec2 uv=(s-uPack.xy)/uPack.zw;float ph=uPack.w;float py=s.y-uPack.y;',
    '  vec3 art=texture2D(uArt,uv).rgb;',
    '  float crimp=clamp(1.-smoothstep(19.,22.,py)+smoothstep(ph-22.,ph-19.,py),0.,1.);',
    '  float ridge=cos(s.x*2.0944)*.55*crimp;',
    '  float ex=(uv.x-.5)*2.;float ey=(uv.y-.5)*2.;',
    '  float nx=ex*.45+sign(ex)*pow(abs(ex),7.)*1.5;',
    '  float ny=ey*.22+sign(ey)*pow(abs(ey),9.)*1.1;',
    '  float c1=fbm(vec2(s.x*.028,s.y*.05)+1.7),c2=fbm(vec2(s.x*.03+9.,s.y*.05)+4.);',
    '  float body=1.-crimp;',
    '  nx+=(c1-.5)*.34*body;ny+=(c2-.5)*.34*body;nx+=(noise(s*.5)-.5)*.015;',
    '  vec3 N=normalize(vec3((nx*body)+ridge,ny*body+ (noise(vec2(s.x*.7,s.y*.2))-.5)*.05*crimp,1.));',
    '  vec3 L=normalize(vec3(uLight*.95,.72));',
    '  vec3 R=reflect(vec3(0.,0.,-1.),N);',
    '  float diff=max(dot(N,L),0.);',
    '  float lum=dot(art,vec3(.3,.59,.11));float pr=smoothstep(.22,.55,lum);float foil=1.-pr*.8;',
    '  vec3 tint=art*1.15+.03;',
    '  float t=dot(N.xy,vec2(1.3,.8))*.7+dot(uLight,vec2(.5,.35))+uv.y*.9+uv.x*.4;',
    '  vec3 rb=.5+.5*cos(6.2831*(t+vec3(0.,.33,.67)));',
    '  float spec=pow(max(dot(R,L),0.),2.);',
    '  vec3 col=tint*(.3+.7*diff);',
    '  col=mix(col,tint*env(R,L)*1.05+rb*(.04+.2*spec)*foil,.36*foil+.1*pr);',
    '  col+=vec3(1.)*pow(max(dot(R,L),0.),60.)*(.08+.2*pr);',
    '  col+=rb*exp(-pow((dot(uv-.5,vec2(.8,.6))-uLight.x*.45)*4.5,2.))*.14*foil;',
    '  col=mix(col,env(R,L)*vec3(.7,.74,.82)+rb*.03,crimp*.6);',
    '  float e=min(min(uv.x,1.-uv.x)*uPack.z,min(uv.y,1.-uv.y)*ph);',
    '  col*=(.72+.28*smoothstep(0.,7.,e))*.86;',
    '  return col;}',
    'void main(){',
    '  vec2 f=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;',
    '  float x0=uPack.x,y0=uPack.y,w=uPack.z,h=uPack.w;',
    '  vec2 c=vec2(x0+w*.5,y0+h*.5);vec2 hs=vec2(w*.5,h*.5);',
    '  float dsh=rbox(f,c+vec2(0.,12.),hs,5.);',
    '  vec4 col=vec4(0.,0.,0.,(1.-smoothstep(-4.,30.,dsh))*.5);',
    '  float cov=1.-smoothstep(-.8,.8,rbox(f,c,hs,4.));',
    '  float top=f.x<uCut?edgeY(f.x):y0;',
    '  cov*=smoothstep(-.8,.8,f.y-top);',
    '  if(cov>0.){vec3 rgb=shade(f);float rim=f.x<uCut?(1.-smoothstep(0.,1.6,f.y-top)):0.;rgb=mix(rgb,vec3(.92,.94,1.),rim*.85);col=vec4(rgb,1.)*cov+col*(1.-cov);}',
    '  vec2 P=vec2(uCut,uTearY);float A=uTheta+1.25*uFly;vec2 tr=vec2(70.,-300.)*uFly*uFly;',
    '  vec2 d=f-tr-P;float cs=cos(A),sn=sin(A);vec2 s=P+vec2(cs*d.x+sn*d.y,-sn*d.x+cs*d.y);',
    '  float st=1.-smoothstep(-.8,.8,rbox(s,c,hs,4.));',
    '  st*=smoothstep(.6,-.6,s.x-uCut);',
    '  st*=smoothstep(.8,-.8,s.y-edgeY(s.x));',
    '  st*=1.-smoothstep(.55,1.,uFly);',
    '  if(st>0.){vec3 rgb=shade(s);float rim=1.-smoothstep(0.,1.6,edgeY(s.x)-s.y);rgb=mix(rgb,vec3(.92,.94,1.),rim*.85);rgb*=1.+.15*uTheta;col=vec4(rgb,1.)*st+col*(1.-st);}',
    '  gl_FragColor=col;}'
].join('\n');

/**
 * Snow falling over the pack, drawn in the same canvas after the pack (one point per flake, so it
 * costs next to nothing). Each point carries x, y (CSS px), size (CSS px) and a kind: a positive
 * value is a round dot of that opacity, a negative one a tiny six-armed flake of that opacity.
 */
export const SNOW_VERTEX_SHADER = [
  'attribute vec4 a;uniform vec2 uRes;uniform float uDpr;varying float vK;',
  'void main(){vec2 c=a.xy*uDpr/uRes*2.-1.;gl_Position=vec4(c.x,-c.y,0.,1.);gl_PointSize=a.z*uDpr;vK=a.w;}',
].join('\n');

export const SNOW_FRAGMENT_SHADER = [
  'precision mediump float;varying float vK;uniform float uFade;uniform float uTime;',
  'void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);float m;',
  '  if(vK>0.){m=smoothstep(1.,.6,r);}',
  '  else{float an=atan(q.y,q.x)+uTime*.8;m=smoothstep(.2,.06,r*abs(sin(3.*an)))*smoothstep(1.,.8,r);}',
  '  float al=abs(vK)*m*uFade;gl_FragColor=vec4(al,al,al,al);}',
].join('\n');
