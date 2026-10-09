import type { SkillGroup, TrackId } from '@/content';
import { Reveal, useReveal } from '@/components/motion';
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

/** "01", "02", … */
function rowNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/** One skill: a square chip that arrives once, a little after the one before it. */
function SkillChip({ skill, index, emphasised }: { skill: string; index: number; emphasised: boolean }) {
  const ref = useReveal<HTMLLIElement>({ delay: 250 + Math.min(index, 10) * 55 });
  return (
    <Chip ref={ref} as="li" shape="square" variant={emphasised ? 'accent' : 'default'}>
      {skill}
    </Chip>
  );
}

/**
 * Skills (#skills) — numbered rows: the number, the group name and the group's skills as square
 * chips, with a line above each row that draws itself across as the row comes into view and the
 * chips arriving once. Hovering a row lights its group up. An emphasised group uses the accent
 * for its name and chip borders. No marquee and nothing that keeps moving. Every skill appears
 * exactly once. On phones the number and name sit above the chips.
 */
export function Skills({ track, groups }: SkillsProps) {
  return (
    <Section id="skills" title="Skills" layout="split">
      {groups.length > 0 ? (
        <ul role="list" className={styles.rows}>
          {groups.map((group, index) => {
            const emphasised = isEmphasised(group, track);
            return (
              <li key={group.slug} className={styles.row} data-skill-group={group.slug} data-emphasised={emphasised || undefined}>
                <Reveal as="span" variant="draw-x" className={cx(styles.rule, index === 0 && styles.ruleFirst)} aria-hidden="true" data-skill-rule />
                {index === groups.length - 1 && <Reveal as="span" variant="draw-x" delay={200} className={cx(styles.rule, styles.ruleEnd)} aria-hidden="true" data-skill-rule />}
                <Reveal as="span" className={styles.number} delay={100} aria-hidden="true" data-skill-number>
                  {rowNumber(index)}
                </Reveal>
                <Reveal as="h3" className={cx(styles.name, emphasised && styles.nameEmphasised)} delay={150}>
                  {group.title}
                </Reveal>
                <ul role="list" className={styles.chips} aria-label={`${group.title} skills`}>
                  {group.skills.map((skill, skillIndex) => (
                    <SkillChip key={`${skillIndex}-${skill}`} skill={skill} index={skillIndex} emphasised={emphasised} />
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
