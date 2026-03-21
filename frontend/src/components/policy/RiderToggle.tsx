interface RiderToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
}

export default function RiderToggle({ enabled, onChange }: RiderToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`w-full flex items-center justify-between gap-4 p-4 rounded-lg border transition-all ${
        enabled
          ? 'border-orange-500 bg-orange-500/10'
          : 'border-gray-700 bg-gray-900 hover:border-gray-600'
      }`}
    >
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-sm font-semibold text-gray-100">Self-Destruct Rider</span>
        <span className="text-xs text-gray-400">
          Covers intentional self-destruct events&nbsp;
          <span className="text-orange-400 font-medium">(+30% premium)</span>
        </span>
      </div>
      {/* Toggle switch */}
      <div
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-orange-500' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  );
}
