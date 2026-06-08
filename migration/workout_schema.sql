-- ============================================================================
-- Task 4 — Workout schema (fresh, zero data risk)
-- Run in the HOST (PersonalFinance1) project SQL editor.
-- Safe to re-run (idempotent): create-if-not-exists + on-conflict seeds.
--
-- Two-person personal app: a single SHARED dataset, with Me/Partner kept as
-- profile ROWS (not auth users), per KICKOFF.md. Access is gated by the shared
-- allow-list via public.is_allowed() (created in supabase_auth_setup.sql).
--
-- After running, expose the schema:
--   Settings -> API -> Exposed schemas -> add "workout".
-- ============================================================================

create schema if not exists workout;
grant usage on schema workout to authenticated;

-- ---- tables (mirror src/apps/workout/lib/db/types.ts) ----

create table if not exists workout.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  unit_default text not null default 'kg',
  created_at timestamptz not null default now()
);

create table if not exists workout.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  primary_muscle text not null,
  body_region text not null check (body_region in ('upper','lower','core')),
  movement_pattern text not null
    check (movement_pattern in ('push','pull','squat','hinge','lunge','carry','core')),
  equipment text not null
    check (equipment in ('barbell','dumbbell','machine','cable','bodyweight','kettlebell')),
  mechanic text not null check (mechanic in ('compound','isolation')),
  laterality text not null check (laterality in ('bilateral','unilateral')),
  default_rep_min int not null,
  default_rep_max int not null,
  default_increment_kg numeric not null,
  notes text not null default '',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workout.routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists workout.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references workout.routines(id) on delete cascade,
  exercise_id uuid not null references workout.exercises(id) on delete cascade,
  sort_order int not null default 0,
  target_sets int not null default 3,
  target_rep_min int not null,
  target_rep_max int not null
);

create table if not exists workout.workouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references workout.profiles(id) on delete cascade,
  routine_id uuid references workout.routines(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text not null default ''
);

create table if not exists workout.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workout.workouts(id) on delete cascade,
  exercise_id uuid not null references workout.exercises(id) on delete cascade,
  sort_order int not null default 0
);

create table if not exists workout.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout.workout_exercises(id) on delete cascade,
  set_number int not null,
  weight_kg numeric not null default 0,
  reps int not null default 0,
  is_warmup boolean not null default false,
  e1rm numeric not null default 0,
  completed_at timestamptz
);

create index if not exists idx_routine_exercises_routine on workout.routine_exercises(routine_id);
create index if not exists idx_workouts_profile on workout.workouts(profile_id);
create index if not exists idx_workout_exercises_workout on workout.workout_exercises(workout_id);
create index if not exists idx_workout_exercises_exercise on workout.workout_exercises(exercise_id);
create index if not exists idx_sets_we on workout.sets(workout_exercise_id);

-- ---- RLS: any allow-listed signed-in account shares the dataset ----
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','exercises','routines','routine_exercises',
    'workouts','workout_exercises','sets'
  ]
  loop
    execute format('alter table workout.%I enable row level security;', t);
    execute format('drop policy if exists allow_listed on workout.%I;', t);
    execute format(
      'create policy allow_listed on workout.%I for all to authenticated using (public.is_allowed()) with check (public.is_allowed());',
      t
    );
    execute format('grant select, insert, update, delete on workout.%I to authenticated;', t);
  end loop;
end $$;

-- ---- seed: Me / Partner profiles (guarded; no unique on name) ----
insert into workout.profiles (name, color, unit_default)
select v.name, v.color, 'kg'
from (values ('Me', '#2563eb'), ('Partner', '#db2777')) as v(name, color)
where not exists (
  select 1 from workout.profiles p where p.name = v.name
);

-- ---- seed: starter exercise library (generated from seed.ts) ----
insert into workout.exercises
  (name, primary_muscle, body_region, movement_pattern, equipment, mechanic, laterality, default_rep_min, default_rep_max, default_increment_kg)
values
  ('Barbell Bench Press','Chest','upper','push','barbell','compound','bilateral',6,10,2.5),
  ('Incline Barbell Bench Press','Chest','upper','push','barbell','compound','bilateral',6,10,2.5),
  ('Dumbbell Bench Press','Chest','upper','push','dumbbell','compound','bilateral',8,12,2),
  ('Incline Dumbbell Press','Chest','upper','push','dumbbell','compound','bilateral',8,12,2),
  ('Machine Chest Press','Chest','upper','push','machine','compound','bilateral',8,12,2),
  ('Cable Fly','Chest','upper','push','cable','isolation','bilateral',10,15,1),
  ('Push-Up','Chest','upper','push','bodyweight','compound','bilateral',8,20,0),
  ('Dip','Chest','upper','push','bodyweight','compound','bilateral',6,12,1),
  ('Overhead Press','Shoulders','upper','push','barbell','compound','bilateral',5,8,2.5),
  ('Seated Dumbbell Shoulder Press','Shoulders','upper','push','dumbbell','compound','bilateral',8,12,2),
  ('Machine Shoulder Press','Shoulders','upper','push','machine','compound','bilateral',8,12,2),
  ('Lateral Raise','Shoulders','upper','push','dumbbell','isolation','bilateral',12,20,1),
  ('Cable Lateral Raise','Shoulders','upper','push','cable','isolation','unilateral',12,20,1),
  ('Rear Delt Fly','Shoulders','upper','pull','dumbbell','isolation','bilateral',12,20,1),
  ('Triceps Pushdown','Triceps','upper','push','cable','isolation','bilateral',10,15,1),
  ('Overhead Cable Extension','Triceps','upper','push','cable','isolation','bilateral',10,15,1),
  ('Skullcrusher','Triceps','upper','push','barbell','isolation','bilateral',8,12,2.5),
  ('Close-Grip Bench Press','Triceps','upper','push','barbell','compound','bilateral',6,10,2.5),
  ('Deadlift','Back','lower','hinge','barbell','compound','bilateral',3,6,5),
  ('Barbell Row','Back','upper','pull','barbell','compound','bilateral',6,10,2.5),
  ('Pendlay Row','Back','upper','pull','barbell','compound','bilateral',5,8,2.5),
  ('Pull-Up','Back','upper','pull','bodyweight','compound','bilateral',5,12,1),
  ('Chin-Up','Back','upper','pull','bodyweight','compound','bilateral',5,12,1),
  ('Lat Pulldown','Back','upper','pull','cable','compound','bilateral',8,12,2),
  ('Seated Cable Row','Back','upper','pull','cable','compound','bilateral',8,12,2),
  ('Single-Arm Dumbbell Row','Back','upper','pull','dumbbell','compound','unilateral',8,12,2),
  ('Machine Row','Back','upper','pull','machine','compound','bilateral',8,12,2),
  ('Face Pull','Back','upper','pull','cable','isolation','bilateral',12,20,1),
  ('Barbell Curl','Biceps','upper','pull','barbell','isolation','bilateral',8,12,2.5),
  ('Dumbbell Curl','Biceps','upper','pull','dumbbell','isolation','bilateral',8,12,1),
  ('Hammer Curl','Biceps','upper','pull','dumbbell','isolation','bilateral',8,12,1),
  ('Cable Curl','Biceps','upper','pull','cable','isolation','bilateral',10,15,1),
  ('Preacher Curl','Biceps','upper','pull','machine','isolation','bilateral',8,12,2),
  ('Back Squat','Quads','lower','squat','barbell','compound','bilateral',5,8,2.5),
  ('Front Squat','Quads','lower','squat','barbell','compound','bilateral',5,8,2.5),
  ('Leg Press','Quads','lower','squat','machine','compound','bilateral',8,12,5),
  ('Hack Squat','Quads','lower','squat','machine','compound','bilateral',8,12,5),
  ('Bulgarian Split Squat','Quads','lower','lunge','dumbbell','compound','unilateral',8,12,2),
  ('Walking Lunge','Quads','lower','lunge','dumbbell','compound','unilateral',8,12,2),
  ('Leg Extension','Quads','lower','squat','machine','isolation','bilateral',10,15,2),
  ('Goblet Squat','Quads','lower','squat','dumbbell','compound','bilateral',8,12,2),
  ('Romanian Deadlift','Hamstrings','lower','hinge','barbell','compound','bilateral',6,10,2.5),
  ('Hip Thrust','Glutes','lower','hinge','barbell','compound','bilateral',8,12,2.5),
  ('Lying Leg Curl','Hamstrings','lower','hinge','machine','isolation','bilateral',10,15,2),
  ('Seated Leg Curl','Hamstrings','lower','hinge','machine','isolation','bilateral',10,15,2),
  ('Glute Bridge','Glutes','lower','hinge','bodyweight','compound','bilateral',10,20,0),
  ('Cable Pull-Through','Glutes','lower','hinge','cable','compound','bilateral',10,15,1),
  ('Standing Calf Raise','Calves','lower','squat','machine','isolation','bilateral',10,15,2),
  ('Seated Calf Raise','Calves','lower','squat','machine','isolation','bilateral',12,20,2),
  ('Plank','Core','core','core','bodyweight','isolation','bilateral',20,60,0),
  ('Hanging Leg Raise','Core','core','core','bodyweight','isolation','bilateral',8,15,0),
  ('Cable Crunch','Core','core','core','cable','isolation','bilateral',12,20,1),
  ('Ab Wheel Rollout','Core','core','core','bodyweight','isolation','bilateral',8,15,0),
  ('Russian Twist','Core','core','core','bodyweight','isolation','bilateral',12,20,0),
  ('Farmer''s Carry','Forearms','core','carry','dumbbell','compound','bilateral',20,40,2)
on conflict (name) do nothing;
