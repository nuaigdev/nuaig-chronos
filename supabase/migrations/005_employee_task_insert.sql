-- Allow employees to create tasks on projects they are members of
CREATE POLICY "Employees can insert tasks on their projects"
  ON tasks FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) = 'employee'
    AND EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = tasks.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Allow employees to update tasks on their projects (e.g. status changes)
CREATE POLICY "Employees can update tasks on their projects"
  ON tasks FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'employee'
    AND EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = tasks.project_id
        AND project_members.user_id = auth.uid()
    )
  );
