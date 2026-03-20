import { useParams } from 'react-router-dom'

export default function TelemetryModule() {
  const { deviceId } = useParams<{ deviceId: string }>()
  return <h2>Telemetry — Device {deviceId}</h2>
}
