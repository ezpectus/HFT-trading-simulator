export default function Metric({ label, value, color = 'text-gray-200' }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className={`font-medium ${color}`}>{value}</div>
    </div>
  )
}
