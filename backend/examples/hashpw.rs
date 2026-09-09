//! Parol uchun Argon2id hash chiqaradi (ilovadagi `hash_password` bilan bir xil).
//! Foydalanish: `cargo run --example hashpw -- <parol>`

use argon2::password_hash::PasswordHasher;
use argon2::Argon2;

fn main() {
    let password = std::env::args()
        .nth(1)
        .expect("parol argument sifatida bering");
    let hash = Argon2::default()
        .hash_password(password.as_bytes())
        .expect("hash")
        .to_string();
    println!("{hash}");
}
