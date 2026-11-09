'use client';

import {useEffect,useRef,useState} from 'react';

export type StreamStatus='connecting'|'live'|'offline';

const FIRST_FRAME_MS=6000;
const IDLE_MS=45000;

/**
 * Live room updates over a server-sent event stream.
 *
 * The server pushes a fresh view the moment a room is written, so an action taken by one
 * player reaches the next player in milliseconds. Polling is only the fallback when the
 * stream cannot be established (older deployment, buffering proxy, flaky network).
 */
export function useRoomStream(code:string|undefined,token:string,onState:(state:any)=>void,apiUrl:(path:string)=>string,onRemoved?:(reason:string)=>void){
 const [status,setStatus]=useState<StreamStatus>('connecting');
 const handler=useRef(onState);handler.current=onState;
 // A kicked guest is dropped from the room: the server closes their stream with one
 // last frame, so the page can explain it instead of silently going quiet.
 const removed=useRef(onRemoved);removed.current=onRemoved;
 useEffect(()=>{
  if(!code||!token){setStatus('connecting');return;}
  let stopped=false,retry=0,timer:number|undefined;
  let controller:AbortController|null=null;
  const connect=async()=>{
   if(stopped)return;
   controller=new AbortController();
   const session=controller;
   let watchdog:number|undefined,gotFrame=false;
   // A buffering proxy can accept the request and never send a body; that must not look
   // like a healthy stream, or the table would freeze waiting for pushes that never come.
   const arm=(ms:number)=>{if(watchdog)window.clearTimeout(watchdog);watchdog=window.setTimeout(()=>session.abort(),ms);};
   try{
    const response=await fetch(apiUrl(`/api/room/stream?code=${encodeURIComponent(code)}`),{headers:{'X-Room-Token':token},cache:'no-store',signal:session.signal});
    if(!response.ok||!response.body)throw new Error('stream unavailable');
    arm(FIRST_FRAME_MS);
    const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
    for(;;){
     const {done,value}=await reader.read();if(done)break;
     buffer+=decoder.decode(value,{stream:true});
     let index:number;
     while((index=buffer.indexOf('\n\n'))>=0){
      const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);
      const line=frame.split('\n').find(part=>part.startsWith('data: '));
      if(!line)continue;
      if(!gotFrame){gotFrame=true;retry=0;setStatus('live');}
      arm(IDLE_MS);
      let frameData:any;try{frameData=JSON.parse(line.slice(6));}catch{frameData=null;}
      if(frameData?.removed){stopped=true;controller?.abort();removed.current?.(String(frameData.reason||'你已被房主请出房间'));return;}
      if(frameData)try{handler.current(frameData);}catch{}
     }
    }
   }catch{/* aborted, or the connection dropped */}
   if(watchdog)window.clearTimeout(watchdog);
   if(stopped)return;
   setStatus('offline');
   // Slow retry while the caller polls, so the table keeps moving either way.
   timer=window.setTimeout(()=>void connect(),Math.min(5000,600*2**retry++));
  };
  void connect();
  return()=>{stopped=true;controller?.abort();if(timer)window.clearTimeout(timer);};
 },[code,token,apiUrl]);
 return status;
}
