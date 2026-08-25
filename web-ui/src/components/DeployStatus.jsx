import { memo, useState } from 'react'
import { Rocket, Server, GitBranch, CheckCircle, XCircle, Loader, Cloud } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'

const MOCK_SERVICES = [
  { id: 'ai-signal-bot', name: 'AI Signal Bot', status: 'running', version: '1.2.0', uptime: '3d 4h', replicas: 1, cpu: 12, memory: 256 },
  { id: 'exchange-sim', name: 'Exchange Simulator', status: 'running', version: '2.0.1', uptime: '3d 4h', replicas: 1, cpu: 8, memory: 128 },
  { id: 'web-ui', name: 'Web UI', status: 'running', version: '1.5.0', uptime: '1d 2h', replicas: 2, cpu: 4, memory: 64 },
  { id: 'redis', name: 'Redis Cache', status: 'running', version: '7.2', uptime: '3d 4h', replicas: 1, cpu: 2, memory: 32 },
  { id: 'postgres', name: 'PostgreSQL', status: 'stopped', version: '16.0', uptime: '0', replicas: 0, cpu: 0, memory: 0 },
]

const STATUS_CONFIG = {
  running: { icon: CheckCircle, color: 'text-accent-green', bg: 'bg-accent-green/10', label: 'Running' },
  stopped: { icon: XCircle, color: 'text-accent-red', bg: 'bg-accent-red/10', label: 'Stopped' },
  deploying: { icon: Loader, color: 'text-accent-yellow', bg: 'bg-accent-yellow/10', label: 'Deploying' },
}

const DeployStatus = memo(function DeployStatus({ addToast }) {
  const [deploying, setDeploying] = useState(false)

  const services = MOCK_SERVICES
  const runningCount = services.filter(s => s.status === 'running').length
  const totalCpu = services.reduce((sum, s) => sum + s.cpu, 0)
  const totalMemory = services.reduce((sum, s) => sum + s.memory, 0)

  const handleDeploy = () => {
    setDeploying(true)
    addToast?.('info', 'Deployment started...')
    setTimeout(() => {
      setDeploying(false)
      addToast?.('success', 'Deployment completed')
    }, 2000)
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Rocket size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Deploy Status</span>
        </div>
        <span className="text-[10px] text-accent-green">{runningCount}/{services.length} running</span>
      </div>

      <div className="grid grid-cols-3 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <Server size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Services</span>
          <span className="text-[11px] text-gray-300">{services.length}</span>
        </div>
        <div className="flex flex-col items-center">
          <Cloud size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">CPU</span>
          <span className="text-[11px] text-accent-blue">{totalCpu}%</span>
        </div>
        <div className="flex flex-col items-center">
          <Cloud size={11} className="text-gray-600 mb-0.5" />
          <span className="text-[9px] text-gray-600">Memory</span>
          <span className="text-[11px] text-accent-yellow">{totalMemory}MB</span>
        </div>
      </div>

      <div className="space-y-1">
        {services.map(svc => {
          const config = STATUS_CONFIG[svc.status] || STATUS_CONFIG.stopped
          const Icon = config.icon
          return (
            <div key={svc.id} className={`p-2 ${config.bg} border border-bg-600`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Icon size={11} className={config.color} />
                  <span className="text-[11px] font-medium text-gray-300">{svc.name}</span>
                </div>
                <span className={`text-[9px] ${config.color}`}>{config.label}</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[9px]">
                <div className="flex flex-col">
                  <span className="text-gray-600">Version</span>
                  <span className="text-gray-400">{svc.version}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-600">Uptime</span>
                  <span className="text-gray-400">{svc.uptime}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-600">Replicas</span>
                  <span className="text-gray-400">{svc.replicas}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-600">CPU/Mem</span>
                  <span className="text-gray-400">{svc.cpu}%/{svc.memory}MB</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={handleDeploy}
        disabled={deploying}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-purple/20 text-accent-purple hover:bg-accent-purple/30 disabled:opacity-50 transition-colors"
      >
        <GitBranch size={12} />
        {deploying ? 'Deploying...' : 'Deploy All'}
      </button>

      {services.length === 0 && (
        <EmptyState icon={Rocket} title="No services" subtitle="Service status will appear here" />
      )}
    </div>
  )
})

export default DeployStatus
