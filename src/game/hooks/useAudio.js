import { useEffect, useRef, useState } from "react";

export function useAudio(defaultUrl, { defaultOn=true, defaultVol=0.6 }={}){
    const [musicOn, setMusicOn] = useState(() => {
        if (typeof window === 'undefined') return defaultOn;
        const saved = localStorage.getItem('pax_music_on');
        return saved ? saved === 'true' : defaultOn;
    });
    const [musicVolume, setMusicVolume] = useState(() => {
        const saved = localStorage.getItem('pax_music_vol');
        return saved ? Math.min(1, Math.max(0, parseFloat(saved))) : defaultVol;
    });
    const audioRef = useRef(null);

    useEffect(() => {
        if (!audioRef.current){ const a=new Audio(defaultUrl); a.loop=true; a.volume=musicVolume; audioRef.current=a; }
        return () => { audioRef.current?.pause(); audioRef.current=null; };
    }, []);

    useEffect(() => {
        localStorage.setItem('pax_music_on', String(musicOn));
        localStorage.setItem('pax_music_vol', String(musicVolume));
        const a = audioRef.current; if (!a) return; a.volume = musicVolume; if (musicOn) a.play().catch(()=>{}); else a.pause();
    }, [musicOn, musicVolume]);

    useEffect(() => {
        const onKey = (e)=>{ if (e.key==='m' || e.key==='M') setMusicOn(v=>!v); };
        window.addEventListener('keydown', onKey); return ()=>window.removeEventListener('keydown', onKey);
    }, []);

    return { musicOn, setMusicOn, musicVolume, setMusicVolume, audioRef };
}
