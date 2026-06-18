import { IfcAPI } from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'

let instance: IfcAPI | null = null
let initPromise: Promise<IfcAPI> | null = null

export function getIfcAPI(): Promise<IfcAPI> {
  if (instance) {
    return Promise.resolve(instance)
  }
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const api = new IfcAPI()
    await api.Init((path: string) => (path.endsWith('.wasm') ? wasmUrl : path), true)
    instance = api
    return api
  })()

  return initPromise
}
