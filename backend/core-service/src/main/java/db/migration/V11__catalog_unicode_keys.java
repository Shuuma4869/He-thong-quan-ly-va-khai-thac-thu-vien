package db.migration;

import java.sql.Connection;
import java.sql.SQLException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Rebuild existing keys without changing IDs or discarding relationships. */
public class V11__catalog_unicode_keys extends BaseJavaMigration {
    private record Row(UUID id, String display, String key) {}

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        var categories = read(connection, "SELECT id,name FROM categories", 150, true);
        var books = read(connection, "SELECT id,title FROM books", 500, false);
        // Validate all rows before writing. Historical collisions require an explicit staff decision.
        write(connection, "UPDATE categories SET name=?,normalized_name=? WHERE id=?", categories);
        write(connection, "UPDATE books SET title=?,normalized_title=? WHERE id=?", books);
    }

    private static ArrayList<Row> read(Connection connection, String sql, int max, boolean unique) throws SQLException {
        var result = new ArrayList<Row>();
        var keys = new HashMap<String, UUID>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                UUID id = rows.getObject(1, UUID.class);
                String display = Normalizer.normalize(rows.getString(2), Normalizer.Form.NFKC)
                        .replaceAll("(?U)\\s+", " ").strip();
                String key = display.toLowerCase(Locale.ROOT);
                if (display.isEmpty() || display.length() > max || (unique && key.length() > max)) {
                    throw new SQLException("Catalog normalization requires manual correction for ID " + id);
                }
                UUID previous = keys.putIfAbsent(key, id);
                if (unique && previous != null) {
                    throw new SQLException("Category normalization collision between IDs " + previous + " and " + id
                            + ". Rename the conflicting category explicitly before retrying; no data was removed.");
                }
                result.add(new Row(id, display, key));
            }
        }
        return result;
    }

    private static void write(Connection connection, String sql, ArrayList<Row> rows) throws SQLException {
        try (var update = connection.prepareStatement(sql)) {
            for (Row row : rows) {
                update.setString(1, row.display());
                update.setString(2, row.key());
                update.setObject(3, row.id());
                update.executeUpdate();
            }
        }
    }
}
