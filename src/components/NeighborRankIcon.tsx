import type { NeighborRank } from '../lib/ranks';

/** Decorative vector illustrations; the adjacent rank name supplies the text label. */
export default function NeighborRankIcon({ rank }: { rank: NeighborRank['name'] }) {
  return <svg className="neighbor-rank-illustration" viewBox="0 0 88 88" width="80" height="80" fill="none" stroke="#596d3c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {rank === 'Tejedor' ? <>
      <path d="M5 31h27M5 38h23M5 45h19M5 52h15M58 54h24M54 61h28M50 68h32M46 75h36" stroke="#9aa879"/>
      <path d="M16 77C19 50 38 26 66 15 65 43 45 67 16 77Z" fill="#c5ce98"/>
      <path d="M27 65c6-15 17-29 29-38-3 16-14 31-29 38Z" fill="#8eaa64"/>
      <path d="m15 79 53-65M23 23l7-15M27 20l12-8M29 24l14-4"/>
      <path d="m60 6 15 15M75 6 60 21M58 12l7-7 12 12-7 7M66 4l12 12M58 14l10 10" stroke="#84935c" strokeWidth="3.2"/>
    </> : rank === 'Ayni' ? <>
      <path d="M29 19C9 28 9 53 27 64l9-11c-11-8-12-20 0-27Z" fill="#c5ce98"/>
      <path d="M59 67C79 58 79 33 61 22L52 33c11 8 12 20 0 27Z" fill="#aebf7e"/>
      <g fill="#c5ce98">
        <path d="m60 25-6-7L41 6q-3-2-4 1t1 4l8 8-12-11q-3-2-4 1t1 4l10 10-12-10q-3-2-4 1t1 4l12 11-10-6q-3-2-4 1t2 5l14 10q6 4 12 1Z"/>
        <path d="m28 63 6 7 13 12q3 2 4-1t-1-4l-8-8 12 11q3 2 4-1t-1-4L47 65l12 10q3 2 4-1t-1-4L50 59l10 6q3 2 4-1t-2-5L48 49q-6-4-12-1Z"/>
      </g>
      <path d="M7 71h16v7H7ZM17 64h16v7H17ZM68 9v-4M68 23v-4M59 14h-4M81 14h-4" stroke="#84935c"/>
      <circle cx="68" cy="14" r="4" fill="#aebf7e" stroke="none"/>
    </> : rank === 'Referente' ? <>
      <circle cx="41" cy="45" r="25" stroke="#a6b384" strokeWidth="1.7"/>
      <path d="m41 15 6 23 23 7-23 6-6 23-6-23-23-6 23-7Z" fill="#dfe5c7" stroke="#9aa879" strokeWidth="1.5"/>
      <path d="m29 71 4-43h17l5 43Z" fill="#b6c58b"/>
      <path d="M31 28h21v-7H31ZM30 20q12-18 23 0ZM28 30h27M41 6v5" fill="#c5ce98"/>
      <path d="M38 21v6M45 21v6M34 41h17M32 52h21M28 72h30M8 18l14 4M6 29h16"/>
      <path d="m72 5 2 8 8-2-5 7 6 5-9-1-2 8-3-8-8 2 5-7-6-5 9 1Z" fill="#8eaa64" stroke="none"/>
      <path d="M45 80 35 65q-3-5 1-6 2-1 5 3l3 4V43q0-5 4-5t4 5v14-3q0-5 4-5 4 0 4 5v3q0-5 4-5t4 5q0-4 4-3 4 1 4 5v9q0 6-5 12Z" fill="#c5ce98"/>
      <path d="M52 57v6M60 57v7M68 58v6"/>
    </> : <>
      <path d="M42 10c2 19-24 25-27 45-3 19 12 27 26 25 19-2 27-20 20-35-7-16-18-16-19-35Z" fill="#c5ce98"/>
      <path d="M40 24c-2 16-19 22-19 36 0 12 8 18 18 18" fill="#a4b873"/>
      <path d="M42 32C34 46 27 57 34 70M52 49q8 15-5 23" stroke="#7d9251"/>
      <path d="m64 9 4 9 10 1-8 7 3 10-9-5-9 5 2-10-7-7 10-1Z" fill="#8eaa64" stroke="#fffef9" strokeWidth="4"/>
      <path d="M68 50q5 14-5 25"/>
    </>}
  </svg>;
}
