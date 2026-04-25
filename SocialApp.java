import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.net.URI;
import java.io.*;
import javax.swing.table.DefaultTableModel;

public class SocialApp {
    // Colors for modern green design
    private static final Color BG_COLOR = new Color(20, 45, 30); // Deep forest green
    private static final Color PANEL_COLOR = new Color(34, 66, 45); // Lighter forest green
    private static final Color BUTTON_COLOR = new Color(39, 174, 96); // Vibrant emerald green
    private static final Color TEXT_COLOR = Color.WHITE;
    private static final Font MAIN_FONT = new Font("Segoe UI", Font.BOLD, 16);
    
    private static final String CREDS_FILE = "credentials.txt";

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> createAndShowGUI());
    }

    private static void createAndShowGUI() {
        try {
            // Make the UI look a bit more modern by using the system look and feel
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception e) {}

        JFrame frame = new JFrame("Social & Vault Hub");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setSize(400, 500);
        frame.setLocationRelativeTo(null);
        frame.getContentPane().setBackground(BG_COLOR);
        frame.setLayout(new BorderLayout());

        // Header Title
        JLabel headerLabel = new JLabel("Social & Vault", SwingConstants.CENTER);
        headerLabel.setFont(new Font("Segoe UI", Font.BOLD, 28));
        headerLabel.setForeground(BUTTON_COLOR);
        headerLabel.setBorder(BorderFactory.createEmptyBorder(30, 10, 20, 10));
        frame.add(headerLabel, BorderLayout.NORTH);

        // Buttons Panel
        JPanel buttonsPanel = new JPanel();
        buttonsPanel.setBackground(BG_COLOR);
        buttonsPanel.setLayout(new GridLayout(4, 1, 15, 15));
        buttonsPanel.setBorder(BorderFactory.createEmptyBorder(10, 50, 40, 50));

        JButton instaBtn = createStyledButton("📷 Instagram", new Color(193, 53, 132));
        instaBtn.addActionListener(e -> openWebpage("https://www.instagram.com/"));

        JButton fbBtn = createStyledButton("📘 Facebook", new Color(24, 119, 242));
        fbBtn.addActionListener(e -> openWebpage("https://www.facebook.com/"));

        JButton tgBtn = createStyledButton("✈️ Telegram", new Color(0, 136, 204));
        tgBtn.addActionListener(e -> openWebpage("https://web.telegram.org/"));

        JButton vaultBtn = createStyledButton("🔐 Password Vault", BUTTON_COLOR);
        vaultBtn.addActionListener(e -> openVaultDialog(frame));

        buttonsPanel.add(instaBtn);
        buttonsPanel.add(tgBtn);
        buttonsPanel.add(fbBtn);
        buttonsPanel.add(vaultBtn);

        frame.add(buttonsPanel, BorderLayout.CENTER);

        frame.setVisible(true);
    }

    private static JButton createStyledButton(String text, Color bgColor) {
        JButton btn = new JButton(text);
        btn.setFont(MAIN_FONT);
        btn.setForeground(Color.WHITE);
        btn.setBackground(bgColor);
        btn.setFocusPainted(false);
        // We use a custom Border for a flatter look
        btn.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(bgColor.darker(), 1),
                BorderFactory.createEmptyBorder(12, 15, 12, 15)
        ));
        btn.setCursor(new Cursor(Cursor.HAND_CURSOR));
        
        // Hover effects (basic implementation for Swing)
        btn.addMouseListener(new MouseAdapter() {
            public void mouseEntered(MouseEvent evt) {
                btn.setBackground(bgColor.brighter());
            }
            public void mouseExited(MouseEvent evt) {
                btn.setBackground(bgColor);
            }
        });
        
        return btn;
    }

    private static void openWebpage(String urlString) {
        try {
            Desktop.getDesktop().browse(new URI(urlString));
        } catch (Exception e) {
            JOptionPane.showMessageDialog(null, "Error opening link: " + e.getMessage());
        }
    }

    private static void openVaultDialog(JFrame parent) {
        JDialog dialog = new JDialog(parent, "Password Vault", true);
        dialog.setSize(600, 400);
        dialog.setLocationRelativeTo(parent);
        dialog.getContentPane().setBackground(PANEL_COLOR);
        dialog.setLayout(new BorderLayout());

        // Header for Vault
        JLabel vaultTitle = new JLabel("Your Saved Accounts", SwingConstants.CENTER);
        vaultTitle.setFont(new Font("Segoe UI", Font.BOLD, 22));
        vaultTitle.setForeground(Color.WHITE);
        vaultTitle.setBorder(BorderFactory.createEmptyBorder(15, 10, 15, 10));
        dialog.add(vaultTitle, BorderLayout.NORTH);

        // Table Model
        DefaultTableModel model = new DefaultTableModel(new String[]{"Platform/App", "Username", "Password"}, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // read-only table by default
            }
        };
        loadCredentials(model);

        JTable table = new JTable(model);
        table.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        table.setRowHeight(25);
        table.setBackground(new Color(45, 80, 55));
        table.setForeground(Color.WHITE);
        table.setGridColor(PANEL_COLOR);
        table.setFillsViewportHeight(true);
        
        // Style Table Header
        table.getTableHeader().setBackground(BUTTON_COLOR.darker());
        table.getTableHeader().setForeground(Color.WHITE);
        table.getTableHeader().setFont(new Font("Segoe UI", Font.BOLD, 14));

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.getViewport().setBackground(PANEL_COLOR);
        scrollPane.setBorder(BorderFactory.createEmptyBorder(10, 20, 10, 20));

        dialog.add(scrollPane, BorderLayout.CENTER);

        // Input Panel
        JPanel bottomPanel = new JPanel(new BorderLayout());
        bottomPanel.setBackground(PANEL_COLOR);
        
        JPanel inputPanel = new JPanel(new GridLayout(2, 4, 10, 5));
        inputPanel.setBackground(PANEL_COLOR);
        inputPanel.setBorder(BorderFactory.createEmptyBorder(10, 20, 20, 20));

        JTextField accountField = new JTextField();
        JTextField userField = new JTextField();
        JPasswordField passField = new JPasswordField();
        JButton addBtn = createStyledButton("Add Entry", BUTTON_COLOR);
        addBtn.setFont(new Font("Segoe UI", Font.BOLD, 14));

        inputPanel.add(createLabel("Platform (e.g., IG):"));
        inputPanel.add(createLabel("Username:"));
        inputPanel.add(createLabel("Password:"));
        inputPanel.add(new JLabel("")); // Spacer
        
        inputPanel.add(accountField);
        inputPanel.add(userField);
        inputPanel.add(passField);
        inputPanel.add(addBtn);

        bottomPanel.add(inputPanel, BorderLayout.CENTER);
        
        JButton deleteBtn = createStyledButton("Delete Selected", new Color(200, 50, 50));
        deleteBtn.setFont(new Font("Segoe UI", Font.BOLD, 12));
        JPanel actionPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        actionPanel.setBackground(PANEL_COLOR);
        actionPanel.add(deleteBtn);
        bottomPanel.add(actionPanel, BorderLayout.SOUTH);

        addBtn.addActionListener(e -> {
            String acc = accountField.getText().trim();
            String usr = userField.getText().trim();
            String pwd = new String(passField.getPassword()).trim();
            if (!acc.isEmpty() && !usr.isEmpty() && !pwd.isEmpty()) {
                model.addRow(new Object[]{acc, usr, pwd});
                saveCredentials(model);
                accountField.setText("");
                userField.setText("");
                passField.setText("");
            } else {
                JOptionPane.showMessageDialog(dialog, "Please fill in all fields.");
            }
        });
        
        deleteBtn.addActionListener(e -> {
            int selectedRow = table.getSelectedRow();
            if(selectedRow != -1) {
                model.removeRow(selectedRow);
                saveCredentials(model);
            } else {
                JOptionPane.showMessageDialog(dialog, "Please select an entry to delete.");
            }
        });

        dialog.add(bottomPanel, BorderLayout.SOUTH);
        dialog.setVisible(true);
    }

    private static JLabel createLabel(String text) {
        JLabel lbl = new JLabel(text);
        lbl.setForeground(Color.LIGHT_GRAY);
        lbl.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        return lbl;
    }

    private static void loadCredentials(DefaultTableModel model) {
        try (BufferedReader br = new BufferedReader(new FileReader(CREDS_FILE))) {
            String line;
            while ((line = br.readLine()) != null) {
                String[] parts = line.split(":::");
                if (parts.length == 3) {
                    model.addRow(parts);
                }
            }
        } catch (FileNotFoundException e) {
            // file doesn't exist yet, it's fine
        } catch (IOException e) {
            System.err.println("Error reading credentials: " + e.getMessage());
        }
    }

    private static void saveCredentials(DefaultTableModel model) {
        try (PrintWriter pw = new PrintWriter(new FileWriter(CREDS_FILE))) {
            for (int i = 0; i < model.getRowCount(); i++) {
                pw.println(model.getValueAt(i, 0) + ":::" + model.getValueAt(i, 1) + ":::" + model.getValueAt(i, 2));
            }
        } catch (IOException e) {
            System.err.println("Error saving credentials: " + e.getMessage());
        }
    }
}
