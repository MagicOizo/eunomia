import type { SubmissionStatus, WorkflowStatus } from '@eunomia/shared';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faCircleHalfStroke,
  faFileInvoice,
  faPaperPlane,
  faReceipt,
} from '@fortawesome/free-solid-svg-icons';

/**
 * How the invoice status ladder is shown. The names of the rungs are the API's
 * (the status is derived there, never stored) and come from @eunomia/shared, so
 * a new one cannot be labelled here and missed there, or the other way round.
 */

export type { SubmissionStatus, WorkflowStatus };

export interface StatusDisplay {
  /** Maps 1:1 to EuBadge tones. */
  tone: 'open' | 'submitted' | 'partial' | 'billed' | 'done';
  label: string;
  icon: IconDefinition;
}

export const STATUS_DISPLAY: Record<WorkflowStatus, StatusDisplay> = {
  offen: { tone: 'open', label: 'Offen', icon: faFileInvoice },
  eingereicht: { tone: 'submitted', label: 'Eingereicht', icon: faPaperPlane },
  teilabgerechnet: { tone: 'partial', label: 'Teilabgerechnet', icon: faCircleHalfStroke },
  abgerechnet: { tone: 'billed', label: 'Abgerechnet', icon: faReceipt },
  erledigt: { tone: 'done', label: 'Erledigt', icon: faCircleCheck },
};

/** Status of an invoice at one policy, shown per submission in the invoice detail. */
export const SUBMISSION_STATUS_DISPLAY: Record<SubmissionStatus, StatusDisplay> = {
  eingereicht: STATUS_DISPLAY.eingereicht,
  abgerechnet: STATUS_DISPLAY.abgerechnet,
};
