const es = {
  title: 'Pipeline de Leads',
  subtitle: 'Contactos captados automáticamente por tus reglas de engagement',

  // Stage labels
  stages: {
    frio:       'Frío',
    tibio:      'Tibio',
    caliente:   'Caliente',
    contactado: 'Contactado',
    convertido: 'Convertido',
  } as Record<string, string>,

  // Stage icons
  stageIcons: {
    frio:       '❄️',
    tibio:      '🌡️',
    caliente:   '🔥',
    contactado: '📞',
    convertido: '✅',
  } as Record<string, string>,

  // View toggles
  viewKanban: 'Kanban',
  viewList:   'Lista',

  // Filters
  filterAll:      'Todos',
  filterChannel:  'Canal',
  searchPlaceholder: 'Buscar por usuario...',

  // Stats
  totalLeads:  'Total',
  hotLeads:    'Calientes',
  converted:   'Convertidos',
  avgScore:    'Score promedio',

  // Empty states
  noLeads:     'Sin leads aún',
  noLeadsHint: 'Los leads aparecen aquí cuando tus reglas de engagement los captan automáticamente.',
  noLeadsStage: 'Sin leads en esta etapa',

  // Lead card
  score:       'Score',
  channel:     'Canal',
  lastSeen:    'Último contacto',
  interactions: 'interacciones',
  moveToStage: 'Mover a',

  // Lead detail drawer
  notesLabel:      'Notas',
  notesPlaceholder: 'Agrega una nota sobre este lead...',
  tagsLabel:       'Etiquetas',
  tagsPlaceholder: 'Agregar etiqueta...',
  markContacted:   'Marcar como contactado',
  markConverted:   'Marcar como convertido',
  deleteBtn:       'Eliminar lead',
  confirmDelete:   '¿Eliminar este lead? Esta acción no se puede deshacer.',
  savingNotes:     'Guardando...',
  notesSaved:      '✓ Guardado',

  // Actions
  addManualLead:    '+ Lead manual',
  addManualTitle:   'Agregar lead manualmente',
  addManualUsername: 'Usuario',
  addManualChannel: 'Canal',
  addManualStage:   'Etapa inicial',
  addManualSave:    'Agregar lead',
  addManualCancel:  'Cancelar',

  // Errors
  errorLoad:   'Error al cargar leads',
  errorUpdate: 'Error al actualizar',
  errorDelete: 'Error al eliminar',
  errorCreate: 'Error al crear lead',
};

export default es;
