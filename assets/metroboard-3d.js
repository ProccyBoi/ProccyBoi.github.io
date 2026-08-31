(() => {
  const W=300,H=300;
  const p=(px,py)=>[(px/1200-0.5)*W,(0.5-py/1200)*H];
  const components=[];
  const add=(spec,px,py)=>{const [x,z]=p(px,py);components.push({...spec,x,z});};

  add({type:'usbC',ref:'J1',name:'USB-C power / programming',copy:'Board-edge USB-C connector feeding the controller section.',w:9.0,h:3.2,d:7.4,rot:0,explode:10,explodeZ:-4},286,1058);
  add({type:'module',ref:'U1',name:'ESP32 wireless controller',copy:'Wi-Fi controller used to receive live TfNSW data and drive the display.',w:25.5,d:18.0,rot:0,explode:14,explodeX:4},470,1025);
  add({type:'chip',ref:'U2',name:'USB-UART interface',copy:'USB serial/programming interface beside the USB-C input.',w:5.0,h:1.2,d:5.0,pins:16,rot:0,explode:12},382,1012);
  add({type:'chip',ref:'U3',name:'LED logic / level interface',copy:'Logic interface between the ESP32 controller and the long addressable-LED chains.',w:9.8,h:1.4,d:4.2,pins:16,rot:90,explode:13},466,905);
  add({type:'chip',ref:'U4',name:'Power-control IC',copy:'Local supply/control circuitry for the LED and controller rails.',w:5.0,h:1.1,d:4.0,pins:8,rot:0,explode:11},332,982);
  add({type:'passive',ref:'L1',name:'Power inductor',copy:'Power-stage magnetic component in the controller cluster.',w:5.2,h:2.4,d:5.2,material:'black',rot:0,explode:12},300,1010);
  add({type:'passive',ref:'C1',name:'Bulk capacitor',copy:'Local bulk decoupling for the controller/pixel supply.',w:3.2,h:2.0,d:2.6,material:'ceramic',rot:90,explode:10},352,1008);
  add({type:'passive',ref:'C2',name:'Bulk capacitor',copy:'Local bulk decoupling for the controller/pixel supply.',w:3.2,h:2.0,d:2.6,material:'ceramic',rot:90,explode:10},365,1002);

  const ledInstances=[];
  const lines=[
    [[112,855],[230,646],[405,685],[515,674],[612,623]],
    [[370,557],[508,544],[665,548]],
    [[615,1110],[676,960],[716,790],[725,625],[842,460]],
    [[606,1110],[690,1060],[778,1028],[872,1010],[968,1000]],
    [[608,1110],[702,1138],[810,1120],[930,1082],[1044,1040]],
    [[518,550],[456,458],[410,362],[442,264],[548,206],[686,188]],
    [[654,548],[744,482],[832,414],[938,365],[1048,332]]
  ];
  const sampleLine=(pts,count)=>{const seg=[];let total=0;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);seg.push(d);total+=d;}for(let n=0;n<count;n++){let dist=(n+0.5)/count*total,i=0;while(i<seg.length-1&&dist>seg[i]){dist-=seg[i];i++;}const a=pts[i],b=pts[i+1],t=seg[i]?dist/seg[i]:0;const px=a[0]+(b[0]-a[0])*t,py=a[1]+(b[1]-a[1])*t;const [x,z]=p(px,py);ledInstances.push([x,z,0]);}};
  [38,34,32,48,44,38,36].forEach((count,i)=>sampleLine(lines[i],count));
  sampleLine([[590,1095],[594,930],[598,770],[600,610]],35);
  sampleLine([[595,1095],[720,1040],[865,995],[1015,950]],28);

  window.PCB_OBJECT_CONFIG={
    boardName:'Metroboard',
    boardCopy:'30 × 30 cm live Sydney rail network PCB. The physical board surface carries the map graphics and 290+ addressable LEDs; the lower controller cluster handles Wi-Fi, power and pixel data.',
    width:W,height:H,thickness:1.6,radius:3.2,maskColor:0x050607,bottomColor:0x050607,edgeColor:0x171819,
    topImage:'assets/images/projects/metroboard2-web.jpg',
    topImageCrop:{x:0.21875,y:0,w:0.5625,h:1,outW:1600,outH:1600,fill:'#050607'},
    components,ledInstances,ledSize:2.0,fadeSurfaceOnExplode:true,cameraDistance:430,startYaw:-28,startPitch:50
  };
})();
