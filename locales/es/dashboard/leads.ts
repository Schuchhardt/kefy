const es = {
  title: 'Pipeline de leads',
  subtitle: 'Contactos captados automáticamente por tus reglas de respuesta',

  // Etapas
  stages: {
    frio:       'Frío',
    tibio:      'Tibio',
    caliente:   'Caliente',
    contactado: 'Contactado',
    convertido: 'Convertido',
  } as Record<string, string>,
  stageLabel: 'Etapa',
  leadsInStage: (n: number) => (n === 1 ? '1 lead' : `${n} leads`),

  // Vista
  viewLabel:  'Vista',
  viewKanban: 'Kanban',
  viewList:   'Lista',

  // Filtros
  searchLabel:        'Buscar leads',
  searchPlaceholder:  'Buscar por usuario…',
  filterStageLabel:   'Filtrar por etapa',
  filterChannelLabel: 'Filtrar por canal',
  // Primera opción de los filtros: corta, que a 360px no se recorte.
  allStages:          'Etapa: todas',
  allChannels:        'Canal: todos',

  // Resumen
  totalLeads:  'Total',
  hotLeads:    'Calientes',
  converted:   'Convertidos',
  avgScore:    'Score promedio',

  // Estados vacíos
  noLeads:       'Aún no tienes leads',
  noLeadsHint:   'Los leads aparecen aquí cuando tus reglas de respuesta los captan automáticamente. También puedes agregarlos a mano.',
  noLeadsAction: 'Crear una regla de respuesta',
  noResults:     'Ningún lead coincide con los filtros',
  noResultsHint: 'Prueba con otra búsqueda o quita los filtros.',
  clearFilters:  'Quitar filtros',
  noLeadsStage:  'Sin leads en esta etapa',

  // Tabla
  colUser:            'Usuario',
  colChannel:         'Canal',
  colStage:           'Etapa',
  colLastInteraction: 'Última interacción',
  colActions:         'Acciones',

  // Tarjeta
  score:        'Score',
  channel:      'Canal',
  lastSeen:     'Último contacto',
  interactions: 'interacciones',
  moveTo:       (stage: string) => `Mover a ${stage}`,
  moveToLabel:  'Mover a otra etapa',
  timeJustNow:  'ahora',
  timeAgo:      (m: number, h: number, d: number) => (m < 60 ? `hace ${m}m` : h < 24 ? `hace ${h}h` : `hace ${d}d`),

  // Detalle
  notesLabel:       'Notas',
  notesPlaceholder: 'Agrega una nota sobre este lead…',
  saveNotes:        'Guardar notas',
  savingNotes:      'Guardando…',
  notesSaved:       'Notas guardadas',
  tagsLabel:        'Etiquetas',
  tagsPlaceholder:  'Escribe una etiqueta y pulsa Enter',
  markContacted:    'Marcar como contactado',
  markConverted:    'Marcar como convertido',
  deleteBtn:        'Eliminar lead',
  confirmDelete:    '¿Eliminar este lead?',
  metaFirst:        'Primera interacción',
  metaLast:         'Última interacción',
  metaCreated:      'Creado',

  // Alta manual
  addManualLead:     'Agregar lead',
  addManualTitle:    'Agregar lead manualmente',
  addManualUsername: 'Usuario',
  addManualChannel:  'Canal',
  addManualStage:    'Etapa inicial',
  addManualSave:     'Agregar lead',
  addManualCancel:   'Cancelar',

  // Errores
  errorLoad:   'Error al cargar leads',
  errorUpdate: 'No se pudo actualizar el lead',
  errorDelete: 'No se pudo eliminar el lead',
  errorCreate: 'Error al crear lead',
};

export default es;
export type LeadsCopy = typeof es;
