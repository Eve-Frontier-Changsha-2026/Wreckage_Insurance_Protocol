import { useEffect, useState } from 'react';

interface Props {
  endsAt: number; // milliseconds timestamp
}

function getTimeLeft(endsAt: number) {
  const diff = endsAt - Date.now();
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalMs: diff };
}

export default function CountdownTimer({ endsAt }: Props) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endsAt));

  useEffect(() => {
    setTimeLeft(getTimeLeft(endsAt));
    const id = setInterval(() => {
      const t = getTimeLeft(endsAt);
      setTimeLeft(t);
      if (!t) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!timeLeft) {
    return <span className="text-red-400 font-semibold">Ended</span>;
  }

  const colorClass =
    timeLeft.totalMs > 3_600_000
      ? 'text-green-400'
      : timeLeft.totalMs > 600_000
        ? 'text-yellow-400'
        : 'text-red-400';

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <span className={`font-mono font-semibold ${colorClass}`}>
      {timeLeft.days > 0 && `${timeLeft.days}d `}
      {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
    </span>
  );
}
