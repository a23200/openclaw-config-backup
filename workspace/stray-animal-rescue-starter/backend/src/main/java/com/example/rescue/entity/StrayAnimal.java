package com.example.rescue.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "stray_animal")
public class StrayAnimal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String category;
    private Integer age;
    private String gender;
    private String healthStatus;
    private String rescueStatus;
    private String description;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public String getHealthStatus() { return healthStatus; }
    public void setHealthStatus(String healthStatus) { this.healthStatus = healthStatus; }
    public String getRescueStatus() { return rescueStatus; }
    public void setRescueStatus(String rescueStatus) { this.rescueStatus = rescueStatus; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
