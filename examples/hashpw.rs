//! Parol uchun Argon2id hash chiqaradi (ilovadagi `hash_password` bilan bir xil).
//! Foydalanish: `cargo run --example hashpw -- <parol>`

use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::Argon2;

fn main() {
    let password = std::env::args()
        .nth(1)
        .expect("parol argument sifatida bering");
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("hash")
        .to_string();
    println!("{hash}");
}
