import { useEffect, type RefObject } from "react";
import anime from "animejs";
import * as THREE from "three";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? true;
}

export function useHeroMotion(root: RefObject<HTMLElement | null>, totalPlants = 122): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const reduced = prefersReducedMotion();
    const countEl = host.querySelector<HTMLElement>("#plantCount");
    const labelEl = host.querySelector<HTMLElement>("#countLabel");
    let countAnimation: ReturnType<typeof anime> | null = null;
    const revealLabel = () => {
      if (!labelEl) return;
      if (reduced) { labelEl.style.opacity = "1"; labelEl.style.transform = "translateX(0)"; return; }
      anime({ targets: labelEl, opacity: [0, 1], translateX: [-10, 0], duration: 500, easing: "easeOutQuad" });
    };
    if (countEl) {
      if (reduced) { countEl.textContent = String(totalPlants); revealLabel(); }
      else {
        const counter = { val: Number(countEl.textContent) || 0 };
        countAnimation = anime({ targets: counter, val: totalPlants, duration: 1900, easing: "easeOutExpo", round: 1, update: () => { countEl.textContent = String(Math.round(counter.val)); }, complete: revealLabel });
      }
    }
    return () => { countAnimation?.pause(); anime.remove([countEl, labelEl].filter(Boolean)); };
  }, [root, totalPlants]);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const reduced = prefersReducedMotion();
    document.documentElement.setAttribute("data-motion", reduced ? "reduced" : "enabled");

    const ripWrap = host.querySelector<HTMLElement>("#ripWrap");
    const ripLabel = host.querySelector<HTMLElement>("#ripProgressLabel");
    const left = host.querySelector<HTMLElement>("#paperLeft");
    const right = host.querySelector<HTMLElement>("#paperRight");
    const reveal = host.querySelector<HTMLElement>(".torn-reveal");
    const cards = Array.from(host.querySelectorAll(".home-plant-card")) as HTMLElement[];
    let cardAnimation: ReturnType<typeof anime> | null = null;

    let threeRaf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;
    const canvas = host.querySelector<HTMLCanvasElement>("#heroCanvas");
    const hero = host.querySelector<HTMLElement>("#hero");
    let mouseX = 0, mouseY = 0;
    const onPointer = (e: MouseEvent) => { mouseX = e.clientX / window.innerWidth - .5; mouseY = e.clientY / window.innerHeight - .5; };
    let onThreeResize: (() => void) | null = null;
    if (canvas && hero && !reduced) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(55, 1, .1, 100); camera.position.z = 12;
        const count = 260; const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) { positions[i*3] = (Math.random()-.5)*22; positions[i*3+1]=(Math.random()-.5)*16; positions[i*3+2]=(Math.random()-.5)*12; }
        geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        material = new THREE.PointsMaterial({ color: 0xd7c58a, size: .09, transparent: true, opacity: .75, depthWrite: false });
        const points = new THREE.Points(geometry, material); scene.add(points);
        onThreeResize = () => { if (!renderer) return; const w=hero.clientWidth, h=hero.clientHeight; renderer.setSize(w,h,false); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); camera.aspect=w/h; camera.updateProjectionMatrix(); };
        onThreeResize(); window.addEventListener("resize", onThreeResize); window.addEventListener("mousemove", onPointer);
        const clock = new THREE.Clock();
        const tick = () => { if (!renderer || !geometry) return; threeRaf=requestAnimationFrame(tick); const t=clock.getElapsedTime(); points.rotation.y=t*.02+mouseX*.15; points.rotation.x=mouseY*.08; const pos=geometry.attributes.position as THREE.BufferAttribute; for(let i=0;i<count;i++){ let y=pos.getY(i)+.004; if(y>8)y=-8; pos.setY(i,y); } pos.needsUpdate=true; renderer.render(scene,camera); };
        tick();
      } catch { renderer = null; }
    }

    const ripTimeline = !reduced && left && right && reveal ? anime.timeline({ autoplay: false }).add({ targets:left, translateX:["0%","-120%"], translateY:["0%","-16%"], rotate:[0,-16], duration:100, easing:"linear" },0).add({ targets:right, translateX:["0%","120%"], translateY:["0%","14%"], rotate:[0,16], duration:100, easing:"linear" },0).add({ targets:[left,right], opacity:[1,0], duration:100, easing:"linear" },0).add({ targets:reveal, opacity:[.15,1], scale:[.94,1], duration:100, easing:"linear" },0) : null;
    let plantsRevealed = false;
    const revealPlants = (progress:number) => {
      if (progress > .95 && !plantsRevealed) { plantsRevealed=true; if(reduced){cards.forEach(c=>{c.style.opacity="1";c.style.transform="none";});} else cardAnimation=anime({targets:cards,opacity:[0,1],translateY:[38,0],scale:[.97,1],delay:anime.stagger(90),duration:750,easing:"easeOutQuart"}); }
      else if (progress < .8 && plantsRevealed) { plantsRevealed=false; cardAnimation?.pause(); cards.forEach(c=>{c.style.opacity="0";c.style.transform="translateY(38px) scale(.97)";}); }
    };
    const clamp=(n:number)=>Math.max(0,Math.min(1,n));
    const updateRip=()=>{ if(!ripWrap)return; const rect=ripWrap.getBoundingClientRect(); const scrollable=rect.height-window.innerHeight; const p=scrollable>0?clamp(-rect.top/scrollable):0; if(ripTimeline)ripTimeline.seek(ripTimeline.duration*p); else if(left&&right){left.style.transform=`translateX(${-p*120}%) rotate(${-p*16}deg)`;right.style.transform=`translateX(${p*120}%) rotate(${p*16}deg)`;left.style.opacity=right.style.opacity=String(1-p);} if(ripLabel){ripLabel.textContent=p>.98?"Torn open":p<.02?"Keep scrolling":`${Math.round(p*100)}% torn`;ripLabel.style.opacity=p>.98?".35":"1";} revealPlants(p);};
    let ticking=false, scrollRaf=0;
    const onScroll=()=>{if(!ticking){scrollRaf=requestAnimationFrame(()=>{updateRip();ticking=false;});ticking=true;}};
    window.addEventListener("scroll",onScroll,{passive:true}); window.addEventListener("resize",updateRip); updateRip();

    return () => { anime.remove([left,right,reveal,...cards].filter(Boolean)); ripTimeline?.pause(); cardAnimation?.pause(); cancelAnimationFrame(threeRaf); cancelAnimationFrame(scrollRaf); window.removeEventListener("scroll",onScroll); window.removeEventListener("resize",updateRip); if(onThreeResize)window.removeEventListener("resize",onThreeResize); window.removeEventListener("mousemove",onPointer); geometry?.dispose(); material?.dispose(); renderer?.dispose(); };
  }, [root]);
}
