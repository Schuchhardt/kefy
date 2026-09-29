import type { LeadsCopy } from '@/locales/es/dashboard/leads';

const en: LeadsCopy = {
  title: 'Leads pipeline',
  subtitle: 'Contacts captured automatically by your auto-reply rules',

  stages: {
    frio:       'Cold',
    tibio:      'Warm',
    caliente:   'Hot',
    contactado: 'Contacted',
    convertido: 'Converted',
  } as Record<string, string>,
  stageLabel: 'Stage',
  leadsInStage: (n: number) => (n === 1 ? '1 lead' : `${n} leads`),

  viewLabel:  'View',
  viewKanban: 'Kanban',
  viewList:   'List',

  searchLabel:        'Search leads',
  searchPlaceholder:  'Search by username…',
  filterStageLabel:   'Filter by stage',
  filterChannelLabel: 'Filter by channel',
  allStages:          'Stage: all',
  allChannels:        'Channel: all',

  totalLeads:  'Total',
  hotLeads:    'Hot',
  converted:   'Converted',
  avgScore:    'Avg. score',

  noLeads:       'No leads yet',
  noLeadsHint:   'Leads show up here when your auto-reply rules capture them. You can also add them by hand.',
  noLeadsAction: 'Create an auto-reply rule',
  noResults:     'No leads match these filters',
  noResultsHint: 'Try another search or clear the filters.',
  clearFilters:  'Clear filters',
  noLeadsStage:  'No leads in this stage',

  colUser:            'User',
  colChannel:         'Channel',
  colStage:           'Stage',
  colLastInteraction: 'Last interaction',
  colActions:         'Actions',

  score:        'Score',
  channel:      'Channel',
  lastSeen:     'Last seen',
  interactions: 'interactions',
  moveTo:       (stage: string) => `Move to ${stage}`,
  moveToLabel:  'Move to another stage',
  timeJustNow:  'just now',
  timeAgo:      (m: number, h: number, d: number) => (m < 60 ? `${m}m ago` : h < 24 ? `${h}h ago` : `${d}d ago`),

  notesLabel:       'Notes',
  notesPlaceholder: 'Add a note about this lead…',
  saveNotes:        'Save notes',
  savingNotes:      'Saving…',
  notesSaved:       'Notes saved',
  tagsLabel:        'Tags',
  tagsPlaceholder:  'Type a tag and press Enter',
  markContacted:    'Mark as contacted',
  markConverted:    'Mark as converted',
  deleteBtn:        'Delete lead',
  confirmDelete:    'Delete this lead?',
  metaFirst:        'First interaction',
  metaLast:         'Last interaction',
  metaCreated:      'Created',

  addManualLead:     'Add lead',
  addManualTitle:    'Add lead manually',
  addManualUsername: 'Username',
  addManualChannel:  'Channel',
  addManualStage:    'Initial stage',
  addManualSave:     'Add lead',
  addManualCancel:   'Cancel',

  errorLoad:   'Error loading leads',
  errorUpdate: "Couldn't update the lead",
  errorDelete: "Couldn't delete the lead",
  errorCreate: 'Error creating lead',
};

export default en;
