import type { SkillGroup, TrackId } from '@/content';
import { Chip, Section, cx } from '@/components/ui';
import styles from './Skills.module.css';

export interface SkillsProps {
  track: TrackId;
  /** getSkillGroups(track). */
  groups: SkillGroup[];
}

/** true when this group is drawn in the accent on this page. */
export function isEmphasised(group: SkillGroup, track: TrackId): boolean {
  return group.emphasis === 'both' || group.emphasis === track;
}

/**
 * Skills (#skills) — rows, not cards: the group name on the left, its skills as chips on the
 * right, a hairline between rows. An emphasised group uses the accent for its name and chip
 * borders. On phones the name sits above the chips.
 */
export function Skills({ track, groups }: SkillsProps) {
  return (
    <Section id="skills" title="Skills">
      {groups.length > 0 ? (
        <ul role="list" className={styles.rows}>
          {groups.map((group) => {
            const emphasised = isEmphasised(group, track);
            return (
              <li key={group.slug} className={styles.row} data-skill-group={group.slug} data-emphasised={emphasised || undefined}>
                <h3 className={cx(styles.name, emphasised && styles.nameEmphasised)}>{group.title}</h3>
                <ul role="list" className={styles.chips} aria-label={`${group.title} skills`}>
                  {group.skills.map((skill, index) => (
                    <Chip key={`${index}-${skill}`} as="li" variant={emphasised ? 'accent' : 'default'}>
                      {skill}
                    </Chip>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>No skills listed yet.</p>
      )}
    </Section>
  );
}
