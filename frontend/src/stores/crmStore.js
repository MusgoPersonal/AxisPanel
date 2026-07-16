import { writable } from 'svelte/store';

export const pipelineCount = writable(0);

export const crmStageOrder = ['new', 'contacted', 'responded', 'qualified', 'proposal', 'client', 'closed', 'lost', 'ignored'];
export const crmStageDisplay = { new:'Nuevo', contacted:'Contactado', responded:'Respondió', qualified:'Calificado', proposal:'Propuesta', client:'Cliente', closed:'Cerrado', lost:'Perdido', ignored:'Ignorado' };

export async function fetchPipeline() {
  try {
    const res = await fetch('/api/crm/pipeline');
    const data = await res.json();
    pipelineCount.set(data.stages.reduce((s, st) => s + st.count, 0));
    return data.stages;
  } catch (e) {
    console.error('Error fetching pipeline:', e);
    return [];
  }
}
