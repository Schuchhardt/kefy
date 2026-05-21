const en = {
  title: 'Leads Pipeline',
  subtitle: 'Contacts captured automatically by your engagement rules',

  stages: {
    frio:       'Cold',
    tibio:      'Warm',
    caliente:   'Hot',
    contactado: 'Contacted',
    convertido: 'Converted',
  } as Record<string, string>,

  stageIcons: {
    frio:       '❄️',
    tibio:      '🌡️',
    caliente:   '🔥',
    contactado: '📞',
    convertido: '✅',
  } as Record<string, string>,

  viewKanban: 'Kanban',
  viewList:   'List',

  filterAll:      'All',
  filterChannel:  'Channel',
  searchPlaceholder: 'Search by username...',

  totalLeads:  'Total',
  hotLeads:    'Hot',
  converted:   'Converted',
  avgScore:    'Avg. score',

  noLeads:     'No leads yet',
  noLeadsHint: 'Leads appear here when your engagement rules capture them automatically.',
  noLeadsStage: 'No leads in this stage',

  score:       'Score',
  channel:     'Channel',
  lastSeen:    'Last seen',
  interactions: 'interactions',
  moveToStage: 'Move to',

  notesLabel:      'Notes',
  notesPlaceholder: 'Add a note about this lead...',
  tagsLabel:       'Tags',
  tagsPlaceholder: 'Add tag...',
  markContacted:   'Mark as contacted',
  markConverted:   'Mark as converted',
  deleteBtn:       'Delete lead',
  confirmDelete:   'Delete this lead? This action cannot be undone.',
  savingNotes:     'Saving...',
  notesSaved:      '✓ Saved',

  addManualLead:    '+ Manual lead',
  addManualTitle:   'Add lead manually',
  addManualUsername: 'Username',
  addManualChannel: 'Channel',
  addManualStage:   'Initial stage',
  addManualSave:    'Add lead',
  addManualCancel:  'Cancel',

  errorLoad:   'Error loading leads',
  errorUpdate: 'Error updating',
  errorDelete: 'Error deleting',
  errorCreate: 'Error creating lead',
};

export default en;
