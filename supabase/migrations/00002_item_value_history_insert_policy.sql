-- Allow authenticated users to insert into item_value_history for their own items.
-- Used when refresh-item-price runs (user JWT) and for any client that records history.
CREATE POLICY item_value_history_insert ON item_value_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM items
    WHERE items.id = item_value_history.item_id
    AND items.user_id = auth.uid()
  )
);
