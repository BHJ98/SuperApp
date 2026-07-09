-- ============================================================================
-- Workout: atomic set-number assignment
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Fixes a race condition: the client used to read the current set count, then
-- insert a new set with count+1 as two separate round trips. Firing several
-- "add set" calls back-to-back (e.g. "add 3 suggested sets") could interleave
-- those reads/writes and produce sets with duplicate set_number values.
--
-- This moves the set_number computation into the insert itself (one
-- statement, one round trip) and adds a unique constraint so that if two
-- inserts still land on the same number (e.g. two devices at the exact same
-- instant), the second fails loudly with a conflict instead of silently
-- creating a duplicate.
-- ============================================================================

-- Guard against pre-existing duplicate (workout_exercise_id, set_number)
-- pairs before adding the constraint, by renumbering within each group.
do $$
declare
  grp record;
  s record;
  n int;
begin
  for grp in
    select workout_exercise_id
    from workout.sets
    group by workout_exercise_id
    having count(*) &lt;&gt; count(distinct set_number)
  loop
    n := 0;
    for s in
      select id from workout.sets
      where workout_exercise_id = grp.workout_exercise_id
      order by completed_at nulls last, id
    loop
      n := n + 1;
      update workout.sets set set_number = n where id = s.id;
    end loop;
  end loop;
end $$;

alter table workout.sets drop constraint if exists sets_we_id_set_number_key;
alter table workout.sets add constraint sets_we_id_set_number_key unique (workout_exercise_id, set_number);

create or replace function workout.add_set(
  p_workout_exercise_id uuid,
  p_weight_kg numeric,
  p_reps int,
  p_is_warmup boolean,
  p_e1rm numeric
) returns workout.sets
language sql
as $$
  insert into workout.sets (workout_exercise_id, set_number, weight_kg, reps, is_warmup, e1rm)
  select
    p_workout_exercise_id,
    coalesce(max(set_number), 0) + 1,
    p_weight_kg,
    p_reps,
    p_is_warmup,
    p_e1rm
  from workout.sets
  where workout_exercise_id = p_workout_exercise_id
  returning *;
$$;

grant execute on function workout.add_set(uuid, numeric, int, boolean, numeric) to authenticated;
