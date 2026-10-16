/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const catCol = app.findCollectionByNameOrId('categories_nc');
    const ncCol = app.findCollectionByNameOrId('no_conformitats');

    const CATEGORIES = [
      { nom: 'Defectos de overlock', descripcio: 'Problemas con costuras de overlock sin rematar, sueltas o abiertas', color: '#dc2626' },
      { nom: 'Problemas de alineación', descripcio: 'Elementos descentrados o mal alineados', color: '#ea580c' },
      { nom: 'Desprendimientos y descosidos', descripcio: 'Costuras que se abren o materiales desprendidos', color: '#d97706' },
      { nom: 'Errores de posicionamiento', descripcio: 'Piezas, accesorios o etiquetas mal posicionadas', color: '#7c3aed' },
      { nom: 'Estampación', descripcio: 'Defectos en logos, estampados o impresiones', color: '#0284c7' },
      { nom: 'Logística', descripcio: 'Errores de etiquetado, talla o envío', color: '#059669' },
      { nom: 'Acabados', descripcio: 'Problemas en la fase de acabados y presentación', color: '#0891b2' },
    ];

    const catMap = {};
    for (const c of CATEGORIES) {
      let r;
      try {
        r = app.findFirstRecordByData('categories_nc', 'nom', c.nom);
      } catch (_) {
        r = new Record(catCol);
        r.load(c);
        app.save(r);
      }
      catMap[c.nom] = r.id;
    }

    const INCIDENTS = [
      { codi: 'INC-001', data_nc: '2024-09-10 10:00:00.000Z', client: 'Cliente A', area: 'estampacion', descripcio: 'Logo frontal desalineado respecto al eje central del mono', proposta_millora: 'Usar plantilla de centrado verificada', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Calibración de la plantilla de posicionamiento', accio_preventiva: 'Verificación sistemática del eje de simetría antes de estampar', cat: 'Estampación', punt_checklist: 'Casado del estampado' },
      { codi: 'INC-002', data_nc: '2024-09-12 09:30:00.000Z', client: 'Cliente A', area: 'confeccio', descripcio: 'Overlock sin rematar en costura lateral derecha', proposta_millora: 'Revisión visual al finalizar cada costura de overlock', prioritat: 'media', estat: 'tancada', solucio_implantada: 'Retrabajo y remate manual', accio_preventiva: 'Revisión obligatoria de todas las costuras laterales al finalizar fase 1', cat: 'Defectos de overlock', punt_checklist: 'Ataques de overlock' },
      { codi: 'INC-003', data_nc: '2024-09-15 11:00:00.000Z', client: 'Cliente B', area: 'confeccio', descripcio: 'Costuras irregulares en zona del cuello, tensión inconsistente', proposta_millora: 'Control de tensión antes de cada operación de cuello', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Reconfección completa del cuello', accio_preventiva: 'Ajuste de tensión de máquina antes de inicio de fase de cuello', cat: 'Desprendimientos y descosidos', punt_checklist: 'Cuello' },
      { codi: 'INC-004', data_nc: '2024-09-18 14:00:00.000Z', client: 'Cliente A', area: 'confeccio', descripcio: 'Bolsillo lateral izquierdo posicionado 1.5cm más arriba de lo especificado en ficha técnica', proposta_millora: 'Usar plantilla de marcaje para bolsillos', prioritat: 'media', estat: 'tancada', solucio_implantada: 'Retrabajo: descosido y reposicionamiento', accio_preventiva: 'Usar plantilla de marcaje para bolsillos en todas las unidades', cat: 'Errores de posicionamiento', punt_checklist: 'Bolsillos' },
      { codi: 'INC-005', data_nc: '2024-09-20 10:30:00.000Z', client: 'Cliente C', area: 'estampacion', descripcio: 'Tinta corrida en estampado dorsal número de piloto', proposta_millora: 'Control de viscosidad y tiempo de secado', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Mono rechazado, reestampado en nueva pieza', accio_preventiva: 'Control de viscosidad de tinta y tiempo de secado previo al manipulado', cat: 'Estampación', punt_checklist: 'Casado del estampado' },
      { codi: 'INC-006', data_nc: '2024-10-02 09:00:00.000Z', client: 'Cliente B', area: 'confeccio', descripcio: 'Cremallera frontal desalineada 2mm a la derecha en zona del pecho', proposta_millora: 'Marcar línea central antes de coser cremallera', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Retrabajo: reposicionamiento de cremallera', accio_preventiva: 'Verificar centrado de cremallera antes de coser', cat: 'Problemas de alineación', punt_checklist: 'Cremalleras' },
      { codi: 'INC-007', data_nc: '2024-10-05 10:00:00.000Z', client: 'Cliente A', area: 'acabats', descripcio: 'Rib de espalda descentrado 3mm hacia el lado izquierdo', proposta_millora: 'Marcar punto central antes de aplicar rib', prioritat: 'media', estat: 'tancada', solucio_implantada: 'Corrección y recentrado del rib', accio_preventiva: 'Marcar punto central antes de aplicar rib de espalda', cat: 'Problemas de alineación', punt_checklist: 'Rib de espalda' },
      { codi: 'INC-008', data_nc: '2024-10-08 15:00:00.000Z', client: 'Cliente C', area: 'confeccio', descripcio: 'Descosido en manga izquierda en punto de unión con hombro (5cm de costura abierta)', proposta_millora: 'Reforzar puntos de unión manga-hombro', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Reconfección de unión manga-hombro', accio_preventiva: 'Control de puntos críticos de unión al terminar fase de montaje', cat: 'Desprendimientos y descosidos', punt_checklist: 'Sisas' },
      { codi: 'INC-009', data_nc: '2024-10-10 09:30:00.000Z', client: 'Cliente B', area: 'logistica', descripcio: 'Talla de etiqueta indicaba L cuando el mono correspondía a talla XL', proposta_millora: 'Doble verificación de talla en etiquetado final', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Corrección de etiquetado y verificación del lote completo', accio_preventiva: 'Doble verificación de talla en etiquetado final por dos operarios', cat: 'Logística', punt_checklist: 'Etiquetas' },
      { codi: 'INC-010', data_nc: '2024-10-15 11:00:00.000Z', client: 'Cliente A', area: 'confeccio', descripcio: 'Overlock suelto en zona de hombro derecho, 8cm sin rematar', proposta_millora: 'Incluir revisión de overlock en checklist de fase 2', prioritat: 'media', estat: 'tancada', solucio_implantada: 'Retrabajo con remate manual de overlock', accio_preventiva: 'Incluir revisión de overlock en checklist de fase 2', cat: 'Defectos de overlock', punt_checklist: 'Ataques de overlock' },
      { codi: 'INC-011', data_nc: '2024-10-18 14:30:00.000Z', client: 'Cliente C', area: 'acabats', descripcio: 'Manchas de suciedad en zona delantera pecho izquierdo, posiblemente aceite de máquina', proposta_millora: 'Cubrir zonas críticas durante operaciones de mantenimiento', prioritat: 'alta', estat: 'tancada', solucio_implantada: 'Limpieza con disolvente específico, verificación de calidad', accio_preventiva: 'Cubrir zonas críticas durante operaciones de mantenimiento', cat: 'Acabados', punt_checklist: 'Limpieza final' },
      { codi: 'INC-012', data_nc: '2024-10-22 10:00:00.000Z', client: 'Cliente A', area: 'confeccio', descripcio: 'Descosido en bolsillo lateral derecho, forro separado del tejido exterior', proposta_millora: 'Revisión del proceso de costura de bolsillos', prioritat: 'media', estat: 'oberta', solucio_implantada: '', accio_preventiva: 'Revisión del proceso de costura de bolsillos con nueva guía', cat: 'Desprendimientos y descosidos', punt_checklist: 'Bolsillos' },
      { codi: 'INC-013', data_nc: '2024-10-25 11:30:00.000Z', client: 'Cliente B', area: 'confeccio', descripcio: 'Costura de puño izquierdo desprendida parcialmente (3cm)', proposta_millora: 'Reforzar puntos finales de costuras en puños', prioritat: 'media', estat: 'oberta', solucio_implantada: '', accio_preventiva: 'Reforzar puntos finales de costuras en puños con puntada de remate', cat: 'Desprendimientos y descosidos', punt_checklist: 'Puños' },
      { codi: 'INC-014', data_nc: '2024-10-28 09:00:00.000Z', client: 'Cliente A', area: 'confeccio', descripcio: 'Overlock sin cerrar en la zona del cuello, extremo suelto visible', proposta_millora: 'Lista de verificación obligatoria de overlock en cuello', prioritat: 'alta', estat: 'oberta', solucio_implantada: '', accio_preventiva: 'Lista de verificación obligatoria: overlock cuello al finalizar UNIC-020', cat: 'Defectos de overlock', punt_checklist: 'Cuello' },
      { codi: 'INC-015', data_nc: '2024-11-02 10:00:00.000Z', client: 'Cliente A', area: 'confeccio', descripcio: 'Velcro mal posicionado en cierre de tobillo, 2cm desplazado hacia el interior', proposta_millora: 'Plantilla de referencia para posicionamiento de velcros en tobillo', prioritat: 'media', estat: 'oberta', solucio_implantada: '', accio_preventiva: 'Plantilla de referencia para posicionamiento de velcros en tobillo', cat: 'Errores de posicionamiento', punt_checklist: 'Velcros' },
    ];

    for (const inc of INCIDENTS) {
      try {
        app.findFirstRecordByData('no_conformitats', 'codi', inc.codi);
        // already exists, skip
      } catch (_) {
        const r = new Record(ncCol);
        r.set('codi', inc.codi);
        r.set('data_nc', inc.data_nc);
        r.set('client', inc.client);
        r.set('area', inc.area);
        r.set('descripcio', inc.descripcio);
        r.set('proposta_millora', inc.proposta_millora);
        r.set('prioritat', inc.prioritat);
        r.set('estat', inc.estat);
        r.set('solucio_implantada', inc.solucio_implantada || '');
        r.set('accio_preventiva', inc.accio_preventiva || '');
        r.set('punt_checklist', inc.punt_checklist || '');
        if (catMap[inc.cat]) r.set('categoria', catMap[inc.cat]);
        app.save(r);
      }
    }
  },
  (app) => {
    const CODIS = ['INC-001','INC-002','INC-003','INC-004','INC-005','INC-006','INC-007',
                   'INC-008','INC-009','INC-010','INC-011','INC-012','INC-013','INC-014','INC-015'];
    for (const codi of CODIS) {
      try { app.delete(app.findFirstRecordByData('no_conformitats', 'codi', codi)); } catch (_) {}
    }
    const CATS = ['Defectos de overlock','Problemas de alineación','Desprendimientos y descosidos',
                  'Errores de posicionamiento','Estampación','Logística','Acabados'];
    for (const nom of CATS) {
      try { app.delete(app.findFirstRecordByData('categories_nc', 'nom', nom)); } catch (_) {}
    }
  }
);
