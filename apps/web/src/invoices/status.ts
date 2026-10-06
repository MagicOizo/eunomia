import type { SubmissionStatus, WorkflowStatus } from '@eunomia/shared';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faCircleHalfStroke,
  faFileInvoice,
  faPaperPlane,
  faReceipt,
} from '@fortawesome/free-solid-svg-icons';

import { i18n } from '../lib/i18n';

const { t } = i18n.global;

/**
 * How the invoice status ladder is shown. The names of the rungs are the API's
 * (the status is derived there, never stored) and come from @eunomia/shared, so
 * a new one cannot be labelled here and missed there, or the other way round.
 * The labels are getters over the catalogue, so a change of language reaches
 * every place that shows one.
 */

export type { SubmissionStatus, WorkflowStatus };

export interface StatusDisplay {
  /** Maps 1:1 to EuBadge tones. */
  tone: 'open' | 'submitted' | 'partial' | 'billed' | 'done';
  label: string;
  icon: IconDefinition;
}

export const STATUS_DISPLAY: Record<WorkflowStatus, StatusDisplay> = {
  offen: {
    tone: 'open',
    icon: faFileInvoice,
    get label() {
      return t('invoices.status.offen');
    },
  },
  eingereicht: {
    tone: 'submitted',
    icon: faPaperPlane,
    get label() {
      return t('invoices.status.eingereicht');
    },
  },
  teilabgerechnet: {
    tone: 'partial',
    icon: faCircleHalfStroke,
    get label() {
      return t('invoices.status.teilabgerechnet');
    },
  },
  abgerechnet: {
    tone: 'billed',
    icon: faReceipt,
    get label() {
      return t('invoices.status.abgerechnet');
    },
  },
  erledigt: {
    tone: 'done',
    icon: faCircleCheck,
    get label() {
      return t('invoices.status.erledigt');
    },
  },
};

/** Status of an invoice at one policy, shown per submission in the invoice detail. */
export const SUBMISSION_STATUS_DISPLAY: Record<SubmissionStatus, StatusDisplay> = {
  eingereicht: STATUS_DISPLAY.eingereicht,
  abgerechnet: STATUS_DISPLAY.abgerechnet,
};
